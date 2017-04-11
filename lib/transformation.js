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
 * This AWS Lambda Node.js package manages the record transformation process
 */

// Modules
var DDB = require('./ddb-utils.js');
var async = require('async');
var deagg = require('aws-kinesis-agg');

//********
// This function prepares an Amazon DynamoDB Stream record
function transformDDBRecord(record, target, callback) {
  try {
    var entry = (record.dynamodb.hasOwnProperty("NewImage") ? record.dynamodb.NewImage : {});
    var object = target.convertDDB ? DDB.parseDynamoDBObject(entry) : entry;
    var data = new Buffer(JSON.stringify(object), 'utf-8');
    var keys = Object.keys(record.dynamodb.Keys);
    var keyEntry = DDB.parseDynamoDBObject(record.dynamodb.Keys);
    var key = "";
    // Concatenate the keys with a '|' separator
    for(var i = 0; i < keys.length; ++i) {
      if(Buffer.isBuffer(keyEntry[keys[i]])) {
        key = key + (i > 0 ? "|": "") + (keyEntry[keys[i]].toString('base64'));
      } else {
        key = key + (i > 0 ? "|": "") + (keyEntry[keys[i]]);
      }
    }

    callback(null, [{
      "key": key,
      "sequenceNumber": record.dynamodb.SequenceNumber,
      "subSequenceNumber": 0,
      "data": data,
      "size": data.length,
      "action": record.eventName,
      "source": record.eventSource,
      "region": record.awsRegion
    }]);
  } catch(e) {
    console.error("Unable to deserialize DynamoDB record, removing it:", e.stack);
    callback(null, []);
  }
}

//********
// This function prepares a single Amazon Kinesis Stream record
function transformKinesisSingleRecord(record, target, callback) {
  try {
    var ingressData = JSON.parse(new Buffer(record.kinesis.data, 'base64').toString());
    // TODO validate versus ingress schema and handle error if not valid
    ingressData.schema = 'com.nordstrom/retail-stream-egress/1-0-0';
    ingressData.eventId = record.eventID;
    ingressData.timeIngest = new Date(record.kinesis.approximateArrivalTimestamp * 1000).toISOString();
    ingressData.timeProcess = new Date().toISOString();
    var data = new Buffer(JSON.stringify(ingressData));
    callback(null, [{
      "key": record.kinesis.partitionKey,
      "sequenceNumber": record.kinesis.sequenceNumber,
      "subSequenceNumber": 0,
      "data": data,
      "size": data.length,
      "action": "PUT",
      "source": record.eventSource,
      "region": record.awsRegion
    }]);
  } catch(e) {
    console.error("Unable to deserialize kinesis record, removing it:", e.stack);
    callback(null, []);
  }
}

//********
// This function prepares an Amazon Kinesis Stream record aggregated with the Amazon KPL (Kinesis Producer Library)
function transformKinesisAggregatedRecords(record, target, callback) {
  deagg.deaggregateSync(record.kinesis, true, function(err, subRecords) {
    if (err) {
      console.error("Unable to deserialize KPL record, removing it:", err);
      callback(null, []);
    } else {
      var resultRecords = async.map(subRecords, function(subRecord, subRecordCallback) {
        transformKinesisSingleRecord({"kinesis": subRecord, "eventSource": record.eventSource, "region": record.region}, target, subRecordCallback);
      }, function(err, results) {
        if(err) {
          console.error("Error occured while transforming KPL records:", e.stack);
          callback(null, []);
        } else {
          // Flatten the structure
          callback(null, [].concat.apply([], results));
        }
      });
    }
  });
}

//********
// This function prepares an Amazon SNS record
function transformSNSRecord(record, target, callback) {
  try {
    var data = new Buffer(record.Sns.Message);
    callback(null, [{
      "key": record.Sns.MessageId,
      "sequenceNumber": record.Sns.Timestamp,
      "subSequenceNumber": 0,
      "data": data,
      "size": data.length,
      "action": "NOTIFICATION",
      "source": record.EventSubscriptionArn,
      "region": record.EventSubscriptionArn.split(':')[3]
    }]);
  } catch(e) {
    console.error("Unable to deserialize SNS record, removing it:", e.stack);
    callback(null, []);
  }
}

//********
// This function prepares the records for further processing
exports.transformRecords = function(sourceRecords, target, callback) {
  async.map(sourceRecords, function(record, recordCallback) {
    if(record.eventSource == "aws:kinesis") {
      if(target.deaggregate) {
        transformKinesisAggregatedRecords(record, target, recordCallback);
      } else {
        transformKinesisSingleRecord(record, target, recordCallback);
      }
    } else if(record.eventSource == "aws:dynamodb") {
      transformDDBRecord(record, target, recordCallback);
    } else if(record.EventSource == "aws:sns") {
      transformSNSRecord(record, target, recordCallback);
    }
  }, function(err, results) {
    if(err) {
      console.error("Error occured while transforming records:", err);
      callback(null, []);
    } else {
      // Flatten the structure
      callback(null, [].concat.apply([], results));
    }
  });
}
