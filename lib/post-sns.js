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
 * This Node.js library processes messages and forwards them to Amazon SNS.
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
}
exports.configure = configure;
configure(defaultValues);

// This function is used to validate the destination in a target. This is used by the configuration
exports.destinationRegex = /^arn:aws:sns:[a-z]+-[a-z]+-[0-9]:[0-9]{12}:[a-zA-Z0-9_-][a-zA-Z0-9_-]{0,255}$/;

// Limits for message publication
exports.limits = {
  maxRecords: Number.MAX_VALUE,  // No limit on number of records, we collapse them in a single value
  maxSize: 250*1024,             // Amazon SNS only accepts up to 256KiB per message
  maxUnitSize: 250*1024,         // Amazon SNS only accepts up to 256KiB per message
  includeKey: false,             // Records will not include the key
  listOverhead: 14,              // Records are put in a JSON object "{"Records":[]}"
  recordOverhead: 0,             // Records are just serialized
  interRecordOverhead: 1         // Records are comma separated
};

//********
// This function creates an instance of an Amazon SNS service
exports.create = function(target, options) {
  var service = new AWS.SNS(options);
  if(config.debug) {
    console.log("Created new AWS.SNS service instance");
  }
  return service;
};

//This will pull out the message attributes we are interested in so we can have some message attributes to filter on in SNS
function extractMessageGroups(records){
  groups = {};

  var allRecords = records.map(function(record) { return JSON.parse(record.data.toString()); })
  allRecords.forEach(function(value, key){
    //extract the key
    var keyGroups = [value.eventMetadata.eventType, value.eventMetadata.emittedBy, value.entityMetadata.entityType, value.entityMetadata.operation];
    var key = keyGroups.join(':');

    //group the items by keys
    if (groups[key]){
        groups[key].push(value);
    }
    else{
        groups[key] = [value];
    }
  })

  return groups;
}

//turns the SNS publish function into a promise
function publishAsync(service, params) {
  return new Promise(function (resolve, reject) {
      service.publish(params, function (err, req, result) {
          if (err) {
            console.log("ERROR: " + err)
              reject(err);
          } else {
            console.log("RESULT: ")
              resolve();
          }
      });
  });
}

function createMessageAttributes(key) {
  var items = key.split(':');
  var attributes = {};

  for (var i =0; i < items.length; i++){
    var item = items[i];
    if (item && item != ''){
      switch(i){
        case 0:
          attributes["eventType"] = {DataType: 'String', StringValue: item};
        break;

        case 1:
          attributes["emittedBy"] = {DataType: 'String', StringValue: item};
        break;

        case 2:
          attributes["entityType"] = {DataType: 'String', StringValue: item};
        break;

        case 3:
          attributes["operation"] = {DataType: 'String', StringValue: item};
        break;
      }
    }
  }

  return attributes;
}

//********
// This function sends messages to Amazon SNS
exports.send = async function(service, target, records, callback) {

  var awaiter = {};
  switch(target.collapse) {
    case "JSON": {
      // We have multiple messages, collapse them in a single JSON Array
      var entries = { Records: records.map(function(record) { return JSON.parse(record.data.toString()); }) };
      awaiter = publishAsync(service, { TargetArn: target.destination, Message: JSON.stringify(entries) });
      break;
    }
    case "concat-b64": {
      // We have multiple messages, collapse them in a single buffer
      var data = Buffer.concat([].concat.apply([], records.map(function(record) { return record.data; })));
      awaiter = publishAsync(service, { TargetArn: target.destination, Message: data.toString('base64') });
      break;
    }
    case "concat": {
      // We have multiple messages, collapse them in a single buffer
      var data = Buffer.concat([].concat.apply([], records.map(function(record) { return record.data; })));
      awaiter = publishAsync(service, { TargetArn: target.destination, Message: data.toString() });
      break;
    }
    case "extract": {
      // We have multiple messages, collapse them in a single JSON Array
      //var entries = { Records: records.map(function(record) { return JSON.parse(record.data.toString()); }) };
      var messageGroups = extractMessageGroups(records);
      var promises = [];

      Object.keys(messageGroups).forEach(function(key,index) {
        var message = { TargetArn: target.destination, Message: JSON.stringify(messageGroups[key])}
        var messageAttributes = createMessageAttributes(key);
        if (messageAttributes){
          message.MessageAttributes = messageAttributes;
        }
        promises.push(publishAsync(service, message));
      });

      awaiter = Promise.all(promises)
      .then(function(){
        return undefined;
      },
      function(err){
        return err;
      })
      break;
    }
    default: {
      // We have a single message, let's send it
      awaiter = publishAsync(service, { TargetArn: target.destination, Message: records[0].data.toString() });
      break;
    }
  }
  
  await awaiter
  .then(callback);

};
