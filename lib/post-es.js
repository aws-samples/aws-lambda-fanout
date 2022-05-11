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
 * This Node.js library processes messages and forwards them to Amazon Elasticsearch Service.
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
  maxSize: 10*1024*1024,         // Amazon ElasticSearch Publish only accepts up to 10MiB in a single call
  maxUnitSize: 10*1024*1024,     // Amazon ElasticSearch Publish only accepts up to 10MiB per message
  includeKey: true,              // Records will include the key
  listOverhead: 0,               // Records are already prepared
  recordOverhead: 0,             // Records are already prepared
  interRecordOverhead: 0         // Records are already prepared
};

// This function is used to validate the destination in a target. This is used by the configuration
exports.destinationRegex = /^search-[a-z][a-z0-9-]{2,27}-[a-z0-9]+\.[a-z]+-[a-z]+-[0-9]\.es\.amazonaws\.com#.*$/;

//********
// This function creates an instance of an Amazon ElasticSearch service
exports.create = function(target, options) {
  var index = target.destination.indexOf('#');
  if(index != -1) {
    var endpoint = target.destination.substr(0, index);
    var destination = target.destination.substr(index+1);
    target.endpoint = endpoint;
    target.destination = destination;
  }
  var service = {
    region: options.region,
    endpoint: new AWS.Endpoint(target.endpoint),
    path: target.destination,
    credentials: (options.credentials ? options.credentials : new AWS.EnvironmentCredentials('AWS'))
  };
  if(config.debug) {
    console.log("Created new Amazon Elasticsearch Service instance");
  }
  return service;
};

//********
// This function sends messages to Amazon ElasticSearch
exports.send = function(service, target, records, callback) {
  var req = new AWS.HttpRequest(service.endpoint);
  req.method = 'POST';
  req.path = service.path + '/_bulk';
  if(req.path.charAt(0) != '/') {
    req.path = '/' + req.path;
  }
  req.region = service.region;
  req.headers['presigned-expires'] = false;
  req.headers['Host'] = service.endpoint.host;

  req.body = Buffer.concat(
      records.map(function(record) 
        { return Buffer.concat([Buffer.from('{"index":{"_id":"' + record.key + '"}}' + "\n", 'utf-8'), record.data, Buffer.from("\n", 'utf-8')]); }));

  var signer = new AWS.Signers.V4(req , 'es');
  signer.addAuthorization(service.credentials, new Date());

  var send = new AWS.NodeHttpClient();
  send.handleRequest(req, null, function(httpResp) {
    var respBody = '';
    httpResp.on('data', function (chunk) {
      respBody += chunk;
    });
    httpResp.on('end', function (chunk) {
      if(httpResp.statusCode == 200) {
        callback(null);
      } else {
        callback(new Error("Error posting to Amazon ElasticSearch: HTTP Status Code: '" + httpResp.statusCode + "', body '" + respBody + "'"));
      }
    });
  }, function(err) {
    callback(new Error("Error posting to Amazon ElasticSearch: '" + err + "'"));
  });
};
