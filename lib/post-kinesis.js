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
 * This Node.js library processes messages and forwards them to Amazon Kinesis Streams.
 */

// Modules
var AWS = require('aws-sdk');
var retry = require('retry');

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
  maxRecords: 500,               // Amazon Kinesis PutRecords only accepts up to 500 messages in a single call
  maxSize: 5*1024*1024,          // Amazon Kinesis PutRecords only accepts up to 5MiB in a single call
  maxUnitSize: 1024*1024,        // Amazon Kinesis PutRecords only accepts up to 1MiB per message
  includeKey: true,             // Records will include the key
  listOverhead: 0,               // Native Amazon Kinesis call, no specific limits
  recordOverhead: 0,             // Native Amazon Kinesis call, no specific limits
  interRecordOverhead: 0         // Native Amazon Kinesis call, no specific limits
};

// This function is used to validate the destination in a target. This is used by the configuration
exports.destinationRegex = /^([a-zA-Z0-9_-]{1,128})$/;

//********
// This function creates an instance of an Amazon Kinesis service
exports.create = function(target, options) {
  var service = new AWS.Kinesis(options);
  if(config.debug) {
    console.log("Created new AWS.Kinesis service instance");
  }
  return service;
};

//********
// This function sends messages to Amazon Kinesis
exports.send = function(service, target, records, callback) {
  var entries = records.map(function(record) { return { PartitionKey: record.key, Data: record.data }; });
  this.putRecordsWithRetry(service, { StreamName: target.destination, Records: entries }, callback);
};

this.putRecordsWithRetry = function(service, request, callback)
{
  var operation = retry.operation({
    retries: 10,
    factor: 2,
    minTimeout: 10,
    maxTimeout: 10000
  });

  operation.attempt(function(current) {
    var response = service.putRecords(request, function() {
      if (response && response.FailedRecordCount && response.FailedRecordCount == 0)
        return;
      if (response && response.Records)
      {
        var failed = response.Records.map(function(record) { return record.ErrorCode != null; } );
        request.Records = request.Records.filter(function(record, index) { return failed[index]; });
        var err = new Error(response.Records[0].ErrorCode);
        if (operation.retry())
          return;
      }
      callback(err ? operation.mainError() : null);
    });
  });
};

Array.prototype.contains = function(element){
  return this.indexOf(element) > -1;
};
