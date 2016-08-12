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
* This Node.js library processes messages and forwards them to an AWS IoT MQTT Topic.
  */

// Modules
var AWS = require('aws-sdk');

// Default values
var defaultValues = {
  debug: false // Activate debug messages
};

var config = {};

function configure(values) {
  if(values) {
    for(var key in values) {
      config[key] = values[key];
    }
  }
};
exports.configure = configure;
configure(defaultValues);

// Limits for message publication
exports.limits = {
  maxRecords: Number.MAX_VALUE,  // No limit on number of records, we collapse them in a single value
  maxSize: 128*1024,             // AWS IoT Publish only accepts up to 128KiB in a single call
  maxUnitSize: 128*1024,         // AWS IoT Publish only accepts up to 128KiB per message
  includeKey: false,             // Records will not include the key
  listOverhead: 14,              // Records are put in a JSON object "{"Records":[]}"
  recordOverhead: 0,             // Records are just serialized
  interRecordOverhead: 1         // Records are comma separated
};

// This function is used to validate the destination in a target. This is used by the configuration
exports.destinationRegex = /^[a-zA-Z0-9-]+\.iot\.[a-z]+-[a-z]+-[0-9]\.amazonaws\.com#.*$/;

//********
// This function creates an instance of an AWS IoT service
exports.create = function(target, options) {
  var index = target.destination.indexOf('#');
  if(index != -1) {
    var endpoint = target.destination.substr(0, index);
    var destination = target.destination.substr(index+1);
    target.endpoint = endpoint;
    target.destination = destination;
  }
  options.endpoint = target.endpoint;
  var service = new AWS.IotData(options);
  if(config.debug) {
    console.log("Created new AWS.IotData service instance");
  }
  return service;
};

//********
// This function sends messages to Amazon IoT
exports.send = function(service, target, records, callback) {
  switch(target.collapse) {
    case "JSON": {
      // We have multiple messages, collapse them in a single JSON Array
      var entries = { Records: records.map(function(record) { return JSON.parse(record.data.toString()); }) };
      service.publish({ topic: target.destination, payload: JSON.stringify(entries), qos: 0 }, callback);
      break;
    }
    case "concat-b64": {
      // We have multiple messages, collapse them in a single buffer
      var data = Buffer.concat([].concat.apply([], records.map(function(record) { return record.data; })));
      service.publish({ topic: target.destination, payload: data.toString('base64'), qos: 0 }, callback);
      break;
    }
    case "concat": {
      // We have multiple messages, collapse them in a single buffer
      var data = Buffer.concat([].concat.apply([], records.map(function(record) { return record.data; })));
      service.publish({ topic: target.destination, payload: data, qos: 0 }, callback);
      break;
    }
    default: {
      // We have a single message, let's send it
      service.publish({ topic: target.destination, payload: records[0].data, qos: 0 }, callback);
    }
  }
};
