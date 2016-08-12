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
 * This Node.js library processes messages and forwards them to AWS Lambda.
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

// This function is used to validate the destination in a target. This is used by the configuration
exports.destinationRegex = /^([a-zA-Z0-9_-]{1,64})$/;

//********
// This function creates an instance of an AWS Lambda service
exports.create = function(target, options) {
  var service = new AWS.Lambda(options);
  if(config.debug) {
    console.log("Created new AWS.Lambda service instance");
  }
  return service;
};

//********
// This function sends messages to AWS Lambda (this will be a simple passthrough)
exports.intercept = function(service, target, event, callback) {
  service.invokeAsync({ FunctionName: target.destination, InvokeArgs: JSON.stringify(event) }, callback);
};
