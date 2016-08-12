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
 * This Node.js library processes messages and forwards them to Amazon ElastiCache Redis.
 */

// Modules
var redis = require('./redis.js');

// Default values
var defaultValues = {
  debug: false, // Activate debug messages
  refreshRate: 60*1000,
  timeout: 1000
};

var config = {};

function configure(values) {
  if(values) {
    for(var key in values) {
      config[key] = values[key];
    }
  }
  redis.configure(values);
};
exports.configure = configure;
configure(defaultValues);

// Limits for message publication
exports.limits = {
  maxRecords: Number.MAX_VALUE,  // No limit on number of records, we collapse them in a single value
  maxSize: Number.MAX_VALUE,     // No limit
  maxUnitSize: Number.MAX_VALUE, // No limit
  includeKey: false,             // Records will not include the key
  listOverhead: 0,               // Records are not concatenated, they are sent one by one to the store
  recordOverhead: 0,             // Records are not quoted
  interRecordOverhead: 0         // Records are not concatenated
};

// This function is used to validate the destination in a target. This is used by the configuration
exports.destinationRegex = /^[a-zA-Z][a-zA-Z0-9-]{0,19}\.[a-z0-9]+\.ng\.[0-9]+\.[a-z]+[0-9]\.cache\.amazonaws\.com:[0-9]+$/;

//********
// This function creates an instance of Redis
exports.create = function(target, options) {
  var service = {
    endpoint: target.destination,
    refresh: 0
  };
  if(config.debug) {
    console.log("Created new Memcached service instance");
  }
  return service;
};

//********
// This function sends messages to Redis
exports.send = function(service, target, records, callback) {
  var entries = records.map(function(record) { return { key: record.key, data: record.data };});
  redis.set(service.endpoint, entries, callback);
};
