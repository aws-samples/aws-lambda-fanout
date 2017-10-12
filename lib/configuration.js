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
 * This Node.js script reads the fanout targets from an Amazon DynamoDB table.
 *
 * The Amazon DynamoDB Table contains:
 *  - sourceArn   (String)  [required]: the ARN of the event source (Amazon Kinesis Stream or Amazon DynamoDB Stream) (Table Hash Key)
 *  - id          (String)  [required]: the identifier of the fan-out target (Table Range Key)
 *  - type        (String)  [required]: the type of destination for the fan-out target (supported: lambda, kinesis, sqs, sns, firehose, iot, es, memcached, redis)
 *  - destination (String)  [required]: the destination of the messages (function name for AWS Lambda, stream name for Amazon Kinesis Streams or Amazon Kinesis Firehose, Queue URL for Amazon SQS, Topic ARN for Amazon SNS, Endpoint FQDN#MQTT Topic Name for AWS IoT, Endpoint FQDN#doctype/index for ES, Cluster Endpoint for Memcached, Primary Endpoint for Redis)
 *  - active      (Boolean) [required]: indicates if this target is active or not
 *  - role        (String)  [optional]: for instance using cross-account roles: you can specify the role ARN that will be assumed
 *  - externalId  (String)  [optional]: for instance using cross-account roles: you can specify an external Id for the STS:AssumeRole call
 *  - region      (String)  [optional]: in case of cross-region calls, you can specify the region name (not supported on memcached)
 *  - collapse    (String)  [optional]: for AWS IoT, Amazon SQS and Amazon SNS, defines if the messages must be colapsed or not (default JSON)
 *  - parallel    (Boolean) [optional]: indicates if we should process sending these messages in parallel. Warning: this may break in-shard ordering for Amazon Kinesis (default true)
 *  - convertDDB  (Boolean) [optional]: for Amazon DynamoDB Streams messages, converts the DDB objects to plain Javascript objects
 *  - deaggregate (Boolean) [optional]: for Amazon Kinesis Streams messages, deserializes KPL (protobuf-based) messages
 */

// Modules
var AWS = require('aws-sdk');
var DDB = require('./ddb-utils.js');

// Default values
var defaultValues = {
  configurationTable : process.env.TABLE_NAME, // DynamoDB Table holding the list of targets for this function
  configRefreshDelay : 5*60*1000,                                        // Reload configuration once very 5 minutes
  debug              : false                                             // Activate debug messages
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

// Targets
var mappings = {}; // List of all target configuration for fan-out

// Runtime variables
var currentRegion = process.env.AWS_REGION;                      // Current region from Lambda environment variables (where the function runs)
var dynamo        = new AWS.DynamoDB({ region: currentRegion }); // DynamoDB service for loading the configuration, in the current region

// Utility variables (constants)
var defaultTarget = {
  sourceArn: null,
  id: null,
  type: null,
  destination: null,
  active: false,
  role: null,
  region: null,
  externalId: null,
  collapse: true,
  parallel: true,
  convertDDB: false,
  deaggregate: false
};

var roleRegex = /^arn:aws:iam::[0-9]{12}:role\/([a-zA-Z0-9+=,.@_-]{1,64})$/;
var regionRegex = /^[a-z]+-[a-z]+-[0-9]$/;
var externalIdRegex = /^[a-zA-Z0-9_+=,.@:\/-]{2,1024}$/;
var collapseRegex = /^JSON|concat|none$/;
var sourceRegex = /^arn:aws:((kinesis:[a-z]+-[a-z]+-[0-9]:[0-9]{12}:stream\/([a-zA-Z0-9_-]{1,128}))|(dynamodb:[a-z]+-[a-z]+-[0-9]:[0-9]{12}:table\/[A-Za-z0-9_.-]+\/stream\/[0-9A-Z_.:-]+))$/;

//********
// This function reads an Amazon DynamoDB record and prepares the configuration entry
function readTarget(record, serviceDefinitions) {
  var target = DDB.parseDynamoDBObject(record, defaultTarget);

  if(((typeof target.id) != "string") || (target.id.length === 0)) {
    console.error("Invalid target configuration, 'id' property must be a non-empty string. Ignoring target");
    return null;
  }

  if(((typeof target.type) != "string") || (! serviceDefinitions.hasOwnProperty(target.type))) {
    console.error("Invalid configuration for target '" + target.id + "', 'type' property must be a valid string in ('" + Object.keys(serviceDefinitions).join("', '") + "'), found '" + target.type + "'. Ignoring target");
    return null;
  }

  if(((typeof target.collapse) != "string") || (! collapseRegex.test(target.collapse))) {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'collapse' property must be a valid collapse type (JSON, concat, concat-b64, none). Ignoring target");
    return null;
  }

  // Force collapse, check role, check region
  switch(target.type) {
    case "es":
    case "firehose":
    case "kinesis": {
      target.collapse = "API";
      break;
    }
    case "memcached":
    case "redis": {
      target.collapse = "multiple";
      if(target.role) {
        console.error("Ignoring parameter 'role' for target '" + target.id + "' of type '" + target.type + "'");
        target.role = null;
      }
      if(target.region) {
        console.error("Ignoring parameter 'region' for target type '" + target.type + "'");
        target.region = null;
      }
    }
    case "sqs":
    case "sns":
    case "iot": {
      // Nothing to do for the collapse
    }
    default: {
      target.collapse = null;
    }
  }

  if(((typeof target.sourceArn) != "string") || (! sourceRegex.test(target.sourceArn))) {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'sourceArn' property must be a valid ARN of an Amazon Kinesis Stream or Amazon DynamoDB Stream. Ignoring target");
    return null;
  }
  if(((typeof target.destination) != "string") || (! serviceDefinitions[target.type].destinationRegex.test(target.destination))) {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'destination' property must be valid for the specified target type, check documentation. Ignoring target");
    return null;
  }

  if((typeof target.active) != "boolean") {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'active' property must be a boolean. Ignoring target");
    return null;
  }
  if((typeof target.parallel) != "boolean") {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'parallel' property must be a boolean. Ignoring target");
    return null;
  }

  if((target.role !== null) && (! roleRegex.test(target.role))) {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'role' property must be a valid string. Ignoring target");
    return null;
  }
  if((target.externalId !== null) && ((typeof target.externalId) != "string")) {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'externalId' property must be a valid string. Ignoring target");
    return null;
  }
  if((target.region !== null) && (! regionRegex.test(target.region))) {
    console.error("Invalid configuration for target '" + target.id + "' of type '" + target.type + "', 'region' property must be a valid string. Ignoring target");
    return null;
  }
  return target;
}

//********
// Load subscribers configuration from DynamoDB Table
exports.get = function(source, serviceDefinitions, callback) {

  if(mappings.hasOwnProperty(source) && (mappings[source].nextConfigurationRefresh > Date.now())) {
    // No need to refresh, just return OK
    callback(null, mappings[source].targets);
    return;
  }

  // Parameters

  // Results
  var targets = [];

  // Read a value from Amazon DynamoDB
  var runQuery = function(exclusiveStartKey) {
    var params = { TableName: config.configurationTable, Select: "ALL_ATTRIBUTES", KeyConditionExpression: "sourceArn = :sourceArn", FilterExpression: "active = :active", ExpressionAttributeValues: { ":active": { BOOL: true }, ":sourceArn": { S: source } } };
    if (exclusiveStartKey) {
      params.ExclusiveStartKey = exclusiveStartKey;
    }

    dynamo.query(params, function(err, data) {
      if(err) {
        console.error("An error occured while loading configuration data from Amazon DynamoDB table '" + config.configurationTable + "':", err);
        callback(new Error("Errors occured while loading configuration data from Amazon DynamoDB table '" + config.configurationTable + "':" + err), null);
        return;
      }

      if (data.hasOwnProperty('Items')) {
        // Add the targets to the list
        targets = targets.concat(data.Items);
      }

      if(data.ExclusiveStartKey) {
        // Still some data to get, query next batch of data
        runQuery(data.ExclusiveStartKey);
        return;
      }

      var entries = targets.map(function (t) { return readTarget(t, serviceDefinitions) }).filter(function(t) { return t != null });
      mappings[source] = {
        targets: entries,
        nextConfigurationRefresh: Date.now() + config.configRefreshDelay
      }

      if(config.debug) {
        console.log("Loaded configuration table ", config.configurationTable, "for function", process.env.AWS_LAMBDA_FUNCTION_NAME, "on source", source, "found", entries.length, "targets");
        entries.forEach(function(target) {
          console.log(" - Id:", target.id, "of type", target.type, "with destination", target.destination);
        });
      }

      callback(null, entries);
    });
  };

  runQuery(null);
};
