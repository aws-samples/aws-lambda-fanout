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
 * This Node.js library manages the Amazon ElastiCache Redis protocol.
 */

// Modules
var net = require('net');

// Default values
var defaultValues = {
  debug: false, // Activate debug messages
  timeout: 1000
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

// Serializes an object to be sent to redis
function serialize(object) {
  if(Array.isArray(object)) {
    var values = object.map(serialize);
    return "*" + values.length + "\r\n" + values.join("")
  } else if(typeof(object) == "string") {
    return "$" + Buffer.byteLength(object) + "\r\n" + object + "\r\n";
  } else if(Buffer.isBuffer(object)) {
    return Buffer.concat([Buffer.from("$" + object.length + "\r\n", 'utf-8'), object, Buffer.from("\r\n", 'utf-8')]);
  } else {
    throw new Error("Unsupported Redis command data type:", JSON.stringify(object));
  }
}

// Deserializes a response from redis (limited support)
function deserialize(string) {
  switch(string.charAt(0)) {
    case '+': { // Simple String
      // Read line content until end of line
      return string.substring(1, string.indexOf("\r\n"));
    }
    case ':': { // Integer
      // Read line content until end of line, and cast as int
      return parseInt(string.substring(1, string.indexOf("\r\n")));
    }
    case '-': { // Error
      // Read line content until end of line, and cast as error
      return new Error(string.substring(1, string.indexOf("\r\n")));
    }
    case '$': { // Bulk String
      return new Error("Unsupported Redis response type: Bulk String in response: " + string);
    }
    case '*': { // Array
      return new Error("Unsupported Redis response type: Array in response: " + string);
    }
  }
}

//********
// This function generates a command to be sent to redis
//  - server: a server to use for ElastiCache
//  - records: a list of {key:<string>, data:<string>} records to be sent
//  - callback: a function expecting a single error parameter, not null if an error occured
//
// --> Documentation: http://redis.io/topics/protocol
exports.set = function(server, records, callback) {
  var parts = server.split(":");
  var query = ["MSET"];

  records.forEach(function(record) {
    query.push(record.key);
    query.push(record.data);
  });

  var content = null;

  try {
    content = serialize(query);
  } catch(e) {
    console.error("Error occured while preparing Redis command:", e);
    callback(new Error("Error occured while sending item to Redis: " + e));
    return;
  }

  var response = "";
  // Send first command to the server
  var client = net.connect({ host: parts[0], port: parts[1] }, function() {
    client.write(content);
  });
  client.setTimeout(config.timeout);
  client.setEncoding('utf8');

  // Wait for response line
  client.on('data', function(chunk) {
    response = response + chunk;
    var index = response.indexOf("\r\n");
    if(index != -1) {
      // We have an answer
      client.end();

      var result = deserialize(response);
      if(result != "OK") {
        console.error("Error occured while sending item to Redis:", result);
        callback(new Error("Error occured while sending item to Redis: " + result));
      } else {
        callback(null);
      }
    }
  });

  client.on('timeout', function() {
    client.removeAllListeners();
    client.end();
    client.destroy();
    console.error("Timeout occured when storing data in Redis");
    callback(new Error("Timeout occured when storing data in Redis"));
  });

  client.on('error', function(err) {
    console.error("Error occured when storing data in Redis:", err);
    callback(new Error("Error occured when storing data in Redis: " + err));
  });
}
