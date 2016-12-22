/* 
 * AWS Lambda Fan-Out Utility
 * 
 * Copyright 2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 * 
 *  http://aws.amazon.com/apache2.0
 * 
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 * 
 */

/* 
 * This AWS Lambda Node.js function receives records from an Amazon Kinesis Stream
 *  or an Amazon DynamoDB Stream, and sends them to other endpoints as defined in
 *  its configuration table (check configuration.js for details).
 */

// Modules
var transformation = require('./lib/transformation.js');
var configuration = require('./lib/configuration.js');
var statistics = require('./lib/statistics.js');
var services = require('./lib/services.js');
var async = require('async');

// Service configuration
var config = {
	parallelTargets    : 2,    // Number of parallel targets for fan-out destination
	parallelPosters    : 2,    // Number of parallel posters for fan-out destination
	debug              : false // Activate debug messages
};
configuration.configure(config);
statistics.configure(config);
services.configure(config);

//********
// This function posts data to the specified service
//  If the target is marked as 'collapse', records will
//  be grouped in a single payload before being sent
function postToService(serviceReference, target, records, stats, callback) {
	var parallelPosters = target.parallel ? config.parallelPosters : 1;
	var errors = [];
  var definition = serviceReference.definition;
  var service = serviceReference.service;
  var limits = definition.limits;

	var maxRecords = limits.maxRecords;
	var maxSize = limits.maxSize;
	var maxUnitSize = limits.maxUnitSize;
  var includeKey = limits.includeKey;
	var listOverhead = limits.listOverhead;
	var recordOverhead = limits.recordOverhead;
	var interRecordOverhead = limits.interRecordOverhead;

  // Filter invalid records
	records = records.filter(function (record) {
    var size = record.size + (includeKey ? Buffer.byteLength(record.key) : 0);
		if((size + listOverhead + recordOverhead) > maxUnitSize) {
			console.error("Record too large to be pushed to target '" + target.id + "' of type '" + target.type + "':\n", JSON.stringify(record));
			errors.push(new Error("Record too large, was removed"));
			return false;
		} else {
			return true;
		}
	});

	// Group records per block for sending
	var maxRecordsPerBlock = (target.collapse !== null) && (target.collapse != "") && (target.collapse != "none") ? maxRecords : 1;
	var blocks = [];
	var blockSize = listOverhead;
	var block = [];
	while(records.length > 0) {
		var record = records.shift();
		var recordSize = record.size + (includeKey ? record.key.length : 0) + recordOverhead + (block.length > 0 ? interRecordOverhead: 0);

		if(((blockSize + recordSize) > maxSize) || (block.length >= maxRecordsPerBlock)) {
			// Block full, start a new block
			blocks.push(block);
			block = [];
			blockSize = listOverhead;
		}

		// Add the record to the records to send
		blockSize = blockSize + recordSize;
		block.push(record);
	}
	if(block.length > 0) {
		blocks.push(block);
		block = [];
	}

	// Posts the blocks to the target services
  var queue = async.queue(function(block, done) {
    definition.send(service, target, block.records, done);
  }, parallelPosters);

  queue.drain = function() {
    serviceReference.dispose();
    callback((errors.length > 0) ? new Error("An error occured while pushing data to an AWS Service"): null);
  };

  // Add all targets to the queue
  blocks.forEach(function(block) {
    queue.push({ records: block }, function(err) {
      if(err) {
        errors.push(err);
        console.error("An error occured while pushing data to target '" + target.id + "' of type '" + target.type + "':", err);
      }
    });
  });
}

//********
// This function transfers an entire event to the underlying service
function interceptService(serviceReference, target, event, stats, callback) {
  serviceReference.definition.intercept(serviceReference.service, target, event, function(err) {
    serviceReference.dispose();
    callback(err);
  });
}

//********
// This function manages the messages for a target
function sendMessages(eventSourceARN, target, event, stats, callback) {
  if(config.debug) {
    console.log("Processing target '" + target.id + "'");
  }

  var start = Date.now();
  stats.addTick('targets#' + eventSourceARN);
  stats.register('records#' + eventSourceARN + '#' + target.destination, 'Records', 'stats', 'Count', eventSourceARN, target.destination);
  stats.addValue('records#' + eventSourceARN + '#' + target.destination, event.Records.length);

  async.waterfall([
      function(done) { services.get(target, done); },
      function(serviceReference, done) { 
        var definition = serviceReference.definition;
        if(definition.intercept) {
          if(target.passthrough) {
            transformation.transformRecords(event.Records, target, function(err, transformedRecords) {
              transformedRecords.forEach(function(record) { record.data = record.data.toString('base64') });
              interceptService(serviceReference, target, { Records: transformedRecords }, stats, done);
            });
          } else {
            interceptService(serviceReference, target, event, stats, done);
          }
        } else if (definition.send) {
          transformation.transformRecords(event.Records, target, function(err, transformedRecords) {
            postToService(serviceReference, target, transformedRecords, stats, done);
          });
        } else {
          done(new Error("Invalid module '" + target.type + "', it must export either an 'intercept' or a 'send' method"));
        }
      }
    ], function(err) {
      if(err) {
        console.error("Error while processing target '" + target.id + "': " + err);
        callback(new Error("Error while processing target '" + target.id + "': " + err));
        return;
      }
      var end = Date.now();
      var duration = Math.floor((end - start) / 10) / 100;
      if(config.debug) {
        console.log("Target '" + target.id + "' for source '" + eventSourceARN + "' successfully processed in" , duration, "seconds with", event.Records.length,"records");
      }
      callback();
    });
}

//********
// This function reads a set of records from Amazon Kinesis or Amazon DynamoDB Streams and sends it to all subscribed parties
function fanOut(eventSourceARN, event, context, targets, stats, callback) {
  if(targets.length === 0) {
    console.log("No output subscribers found for this event");
    callback(null);
    return;
  }

  var start        = Date.now();
  var hasErrors    = false;

  var queue = async.queue(function(target, done) {
    sendMessages(eventSourceARN, target, event, stats, done);
  }, config.parallelTargets);

  queue.drain = function() {
    var end = Date.now();
    var duration = Math.floor((end - start) / 10) / 100;
    if(hasErrors) {
      console.error("Processing of subscribers for this event ended with errors, check the logs in" , duration, "seconds");
      callback(new Error("Some processing errors occured, check logs"));
    } else {
      console.log("Processing succeeded, processed " + event.Records.length + " records for " + targets.length + " targets in" , duration, "seconds");
      callback(null);
    }
  };

  // Add all targets to the queue
  targets.forEach(function(target) {
    queue.push(target, function(err) {
      if(err) {
        console.error("Error processing record: ", err);
        hasErrors = true;
      }
    });
  });
}

//********
// Lambda entry point. Loads the configuration and does the fanOut
exports.handler = function(event, context) {
  var stats = statistics.create();
  stats.register('sources', 'Sources', 'counter', 'Count'); // source, destination
  stats.register('records', 'Records', 'counter', 'Count'); // source, destination

  if (config.debug) {
    console.log("Starting process of " + event.Records.length + " events");
  }

  // Group records per source ARN
  var sources = {};
  event.Records.forEach(function(record) {
    var eventSourceARN = record.eventSourceARN || record.TopicArn;
    if(! sources.hasOwnProperty(eventSourceARN)) {
      stats.addTick('sources');
      stats.register('records#' + eventSourceARN, 'Records', 'counter', 'Count', eventSourceARN);
      stats.register('targets#' + eventSourceARN, 'Targets', 'counter', 'Count', eventSourceARN);
      sources[eventSourceARN] = { Records: [record] };
    } else {
      sources[eventSourceARN].Records.push(record);
    }
    stats.addTick('records#' + eventSourceARN);
  });

  var eventSourceARNs = Object.keys(sources);
  var hasError = false;

  var queue = async.queue(function(eventSourceARN, callback) {
    async.waterfall([
        function(done) {  configuration.get(eventSourceARN, services.definitions, done); },
        function(targets, done) {  fanOut(eventSourceARN, sources[eventSourceARN], context, targets, stats, done); }
      ],
      callback);
  });

  queue.drain = function() {
    stats.publish(function() {
      if(hasError) {
        context.fail('Some processing errors occured, check logs'); // ERROR with message
      } else {
        context.succeed("Done processing all subscribers for this event, no errors detected"); // SUCCESS with message
      }
    });
  };

  eventSourceARNs.forEach(function(eventSourceARN) {
    queue.push(eventSourceARN, function(err) {
      if(err) {
        console.error("Error while processing events from source '" + eventSourceARN + "'", err);
        hasError = true;
      }
    })
  });
};
