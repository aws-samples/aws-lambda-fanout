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
 * This Node.js library manages the Amazon ElastiCache Memcached protocol.
 */

// Modules
var crypto = require('crypto');
var net = require('net');

// Default values
var defaultValues = {
  debug: false, // Activate debug messages
  expiration: 0,
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

//********
// This function queries memcached for the list of endpoints
//
// --> Documentation: http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/AutoDiscovery.AddingToYourClientLibrary.html
exports.servers = function(endpoint, callback) {
  var response = "";
  var errors = [];
  var lines = [];
  var servers = [];
  var parts = endpoint.split(':');

  // Send specific message to server
  var client = net.connect({ host: parts[0], port: parts[1] }, function() {
    client.write("config get cluster\r\n");
  });
  client.setTimeout(config.timeout);
  client.setEncoding('utf8');

  // Buffer all data and parse response when "END" is received
  client.on('data', function(chunk) {
    response = response + chunk;

    var index = response.indexOf("\r\n");
    while(index != -1) {
      var line = response.substr(0, index); // Strip "\r\n"
      response = response.substr(index+2);
      lines.push(line);

      if(line == "END") {
        // First line (\r\n delimited) is the CONFIG response
        if(lines[0].split(" ")[0] != "CONFIG") {
          console.error("Invalid response from server when requesting MemcacheD cluster configuration", JSON.stringify(lines));
          callback(new Error("Invalid response from server when requesting MemcacheD cluster configuration" + lines[0]), servers);
          client.end();
          break;
        }

        // Second line ("\r\n" delimited) contains the response data
        //  Server names (" " separated) are in the second part ("\n" delimited)
        var serverList = lines[1].split("\n")[1].split(" ");
        for(var i = 0; i < serverList.length; ++i) {
          var info = serverList[i].split("|");
          servers.push(info[1] + ":" + info[2]);
        }

        // Done, get back the result
        callback(null, servers);
        client.end();
        break;
      }
      index = response.indexOf("\r\n");
    }
  });

  client.on('timeout', function() {
    client.removeAllListeners();
    client.end();
    client.destroy();
    console.error("Timeout occured when retrieving server list");
    callback(new Error("Timeout occured when retrieving server list"), servers);
  });

  client.on('error', function(err) {
    console.error("Error occured when retrieving server list:", err);
    callback(new Error("Error occured when retrieving server list: " + err), servers);
  });
}

//********
// This function generates a command to be sent to memcached
//  - servers: a list of servers to use for ElastiCache (uses MD5 based consistend hashing for storage)
//  - records: a list of {key:<string>, data:<string>} records to be sent
//  - callback: a function expecting a single error parameter, not null if an error occured
//
// --> Documentation: https://github.com/memcached/memcached/blob/master/doc/protocol.txt
exports.set = function(servers, records, callback) {
  // Ensure consistent hashing of records using MD5 (not secure for signing but fast for consistent hashing)
  var buckets = {};
  var serversLength = servers.length;
  for(var i = 0; i < records.length; ++i) {
    var record = records[i];
    var hash = crypto.createHash('md5').update(record.key).digest('hex');

    // Compute consistent hashing on first byte (ElastiCache only supports 20 nodes)
    var hashIndex = parseInt(hash.substr(0, 2), 16);
    var server = servers[serversLength - 1];
    for(var j = 1; j < serversLength; ++j) {
      var end = Math.floor((256 / serversLength) * j);
      if(end > hashIndex) {
        server = servers[j - 1];
        break;
      }
    }
    if(! buckets.hasOwnProperty(server)) {
      buckets[server] = [];
    }
    buckets[server].push(record);
  }

  var errors = [];
  var serverNames = Object.keys(buckets);
  var processBucket = function() {
    if(serverNames.length > 0) {
      var serverName = serverNames.shift();
      var entries = buckets[serverName];
      var parts = serverName.split(":");

      var storeEntry = function(client) {
        if(entries.length > 0) {
          var record = entries.shift();
          var command = "set " + record.key + " 0 " + config.expiration + " " + record.data.length;
          client.write(command + "\r\n");
          client.write(record.data);
          client.write("\r\n");
        } else {
          processBucket();
          client.end();
        }
      }

      var response = "";
      // Send first command to the server
      var client = net.connect({ host: parts[0], port: parts[1] }, function() {
        storeEntry(client);
      });
      client.setTimeout(config.timeout);
      client.setEncoding('utf8');

      // Wait for response line
      client.on('data', function(chunk) {
        response = response + chunk;
        var index = response.indexOf("\r\n");
        if(index != -1) {
          // We have an answer, run next iteration
          var code = response.substr(0, index); // Strip "\r\n"
          response = response.substr(index+2);
          if(code != "STORED") {
            console.error("Error occured while sending item to MemcacheD: " + code);
            errors.push(new Error("Error occured while sending item to MemcacheD: " + code));
          }
          storeEntry(client);
        }
      });

      client.on('timeout', function() {
        client.removeAllListeners();
        client.end();
        client.destroy();
        console.error("Timeout occured when storing data");
        errors.push(new Error("Timeout occured when storing data"));
        processBucket();
      });

      client.on('error', function(err) {
        console.error("Error occured when storing data:", err);
        errors.push(new Error("Error occured when storing data: " + err));
        processBucket();
      });
    } else {
      if(errors.length == 0) {
        callback(null);
      } else {
        callback(new Error("Errors occured while sending data to Memcached"));
      }
    }
  };
  processBucket();
}
