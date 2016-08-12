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
 * This Node.js script provides utility functions for Amazon DynamoDB and Amazon DynamoDB Streams.
 */

//********
// This function duplicates a simple Javascript object
function duplicateObject(value) {
  if(value === null) {
    return null;
  } else if (((typeof value) == "string") || ((typeof value) == "number") || ((typeof value) == "boolean")) {
    return value;
  } else if (Array.isArray(value)) {
    return value.map(duplicateObject);
  } else if (value instanceof Date) {
    return value;
  } else if ((typeof value) == "object") {
    var result = Object.create(Object.getPrototypeOf(value));
    var properties = Object.keys(value);
    properties.forEach(function(propertyName) {
      result[propertyName] = duplicateObject(value[propertyName]);
    });
    return result;
  } else {
    throw new Error("Unsupported value type");
  }
}

//********
// This function transforms an object from an Amazon DynamoDB format to a Javascript object
function parseDynamoDBObject(value, defaultValues) {
  var result = duplicateObject(defaultValues || {});
  if(value === null) {
    return result;
  }
  var properties = Object.keys(value);
  properties.forEach(function(propertyName) {
    result[propertyName] = parseDynamoDBPropertyValue(value[propertyName]);
  });
  return result;
}

//********
// This function transforms the value of an Amazon DynamoDB Object property
function parseDynamoDBPropertyValue(value) {
  if(value === null || value === undefined) {
    throw new Error("Can not process null or undefined properties");
  }
  var properties = Object.keys(value);
  if(properties.length === 0) {
    throw new Error("Can not process empty properties");
  }
  var dataType = properties[0];
  switch(dataType) {
    case "S": {
      return value.S;
    }
    case "B": {
      //return new Buffer(value.B, 'base64');
      return value.B; // Leave it as a base64 string for subsequent serialization
    }
    case "N": {
      return Number(value.N);
    }
    case "NULL": {
      return null;
    }
    case "BOOL": {
      return value.BOOL;
    }
    case "NS": {
      return value.NS.map(function(entry) {
        return Number(entry);
      });
    }
    case "SS": {
      return value.SS;
    }
    case "BS": {
      return value.BS.map(function(entry) {
        //return new Buffer(entry, 'base64');
        return entry; // Leave it as a base64 string for subsequent serialization
        return new Buffer(entry, 'base64');
      });
    }
    case "L": {
      return value.L.map(function(entry) {
        return parseDynamoDBPropertyValue(entry);
      });
    }
    case "M": {
      var result = {};
      var properties = Object.keys(value.M);
      properties.forEach(function(propertyName) {
        result[propertyName] = parseDynamoDBPropertyValue(value.M[propertyName]);
      });
      return result;
    }
    default: {
      throw new Error("Unknown property type " + dataType);
    }
  }
}

exports.duplicateObject = duplicateObject;
exports.parseDynamoDBObject = parseDynamoDBObject;
exports.parseDynamoDBPropertyValue = parseDynamoDBPropertyValue;