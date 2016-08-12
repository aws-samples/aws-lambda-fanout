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
 * This Node.js library processes messages and forwards them to Amazon ElastiCache Memcached.
 */

// Modules
var memcached = require('./memcached.js');

// Default values
var defaultValues = {
  debug: false, // Activate debug messages
  refreshRate: 60*1000,
  expiration: 0, //10*60,
  timeout: 1000
};

var config = {};

function configure(values) {
  if(values) {
    for(var key in values) {
      config[key] = values[key];
    }
  }
  memcached.configure(values);
};
exports.configure = configure;
configure(defaultValues);

// Limits for message publication
exports.limits = {
  maxRecords: Number.MAX_VALUE,  // No limit on number of records, we collapse them in a single value
  maxSize: 1024*1024,            // MemcacheD default only accepts up to 1MiB in a single call
  maxUnitSize: 1024*1024,        // MemcacheD default only accepts up to 1MiB per message
  includeKey: false,             // Records will not include the key
  listOverhead: 0,               // Records are not concatenated, they are sent one by one to the store
  recordOverhead: 0,             // Records are not quoted
  interRecordOverhead: 0         // Records are not concatenated
};

// This function is used to validate the destination in a target. This is used by the configuration
exports.destinationRegex = /^[a-zA-Z][a-zA-Z0-9-]{0,19}\.[a-z0-9]+\.cfg\.[a-z]+[0-9]\.cache\.amazonaws\.com:[0-9]+$/;

//********
// This function creates an instance of Memcached
exports.create = function(target, options) {
  var service = {
    endpoint: target.destination,
    hosts: [],
    refresh: 0
  };
  if(config.debug) {
    console.log("Created new Memcached service instance");
  }
  return service;
};

//********
// This function checks if we need to reload the list of hosts (initially done every minute)
function refreshHosts(service, callback) {
  if(service.refresh < Date.now()) {
    memcached.servers(service.endpoint, function(err, hosts) {
      if(err) {
        callback(err);
      } else {
        service.hosts = hosts;
        service.refresh = Date.now() + config.refreshRate;
        callback(null);
      }
    });
  } else {
    callback(null);
  }
}

//********
// This function sends messages to Memcached
exports.send = function(service, target, records, callback) {
  refreshHosts(service, function(err) {
    if(err) {
      callback(err);
    } else {
      var entries = records.map(function(record) { return { key: record.key, data: record.data };});
      memcached.set(service.hosts, entries, callback);
    }
  });
};
