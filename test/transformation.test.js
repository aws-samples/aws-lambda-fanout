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
 * This Node.js script tests the features from the transformation.js script
 */

var transformation = require('../lib/transformation.js');

var assert = require('assert');

describe('transformation', function() {
  describe('#DynamoDB.convert()', function () {
    it('should support DynamoDB Objects', function (done) {
      var source = [ { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "myhash" } }, "NewImage": { "hash": { "S": "myhash" } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" } ];
      var target = { convertDDB: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "myhash");
        assert.deepStrictEqual(JSON.parse(result[0].data.toString()), {"hash": "myhash"});
        done(err);
      })
    });
    it('should support DynamoDB Objects with Composite Keys', function (done) {
      var source = [ { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "myhash" }, "id": { N: 10 } }, "NewImage": { "hash": { "S": "myhash" }, "id": { N: 10 } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" } ];
      var target = { convertDDB: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "myhash|10");
        assert.deepStrictEqual(JSON.parse(result[0].data.toString()), {"hash": "myhash", "id": 10});
        done(err);
      })
    });
    it('should support multiple DynamoDB Objects', function (done) {
      var source = [
        { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "hash1" } }, "NewImage": { "hash": { "S": "hash1" } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" },
        { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "hash2" }, "id": { N: 10 } }, "NewImage": { "hash": { "S": "hash2" }, "id": { N: 10 } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" }
      ];
      var target = { convertDDB: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "hash1");
        assert.deepStrictEqual(JSON.parse(result[0].data.toString()), {"hash": "hash1"});
        assert.strictEqual(result[1].key, "hash2|10");
        assert.deepStrictEqual(JSON.parse(result[1].data.toString()), {"hash": "hash2", "id": 10});
        done(err);
      })
    });
  });
  describe('#DynamoDB.no-convert()', function () {
    it('should support DynamoDB Objects', function (done) {
      var source = [ { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "myhash" } }, "NewImage": { "hash": { "S": "myhash" } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" } ];
      var target = { convertDDB: false };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "myhash");
        assert.deepStrictEqual(JSON.parse(result[0].data.toString()), {"hash": { "S": "myhash" }});
        done(err);
      })
    });
    it('should support DynamoDB Objects with Composite Keys', function (done) {
      var source = [ { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "myhash" }, "id": { N: 10 } }, "NewImage": { "hash": { "S": "myhash" }, "id": { N: 10 } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" } ];
      var target = { convertDDB: false };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "myhash|10");
        assert.deepStrictEqual(JSON.parse(result[0].data.toString()), {"hash": { "S": "myhash" }, "id": { N: 10 }});
        done(err);
      })
    });
    it('should support multiple DynamoDB Objects', function (done) {
      var source = [
        { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "hash1" } }, "NewImage": { "hash": { "S": "hash1" } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" },
        { "awsRegion": "r1", "dynamodb": { "Keys": { "hash": { "S": "hash2" }, "id": { N: 10 } }, "NewImage": { "hash": { "S": "hash2" }, "id": { N: 10 } }, "SequenceNumber": "1" }, "eventID": "1", "eventName": "INSERT", "eventSource": "aws:dynamodb", "eventSourceARN": "arn:aws:dynamodb:us-east-1:0123456789ab:table/test/stream/2016-01-16T16:10:56.235", "eventVersion": "1.0" }
      ];
      var target = { convertDDB: false };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "hash1");
        assert.deepStrictEqual(JSON.parse(result[0].data.toString()), {"hash": { "S": "hash1" }});
        assert.strictEqual(result[1].key, "hash2|10");
        assert.deepStrictEqual(JSON.parse(result[1].data.toString()), {"hash": { "S": "hash2" }, "id": { N: 10 }});
        done(err);
      })
    });
  });
  describe('#Kinesis.no-deagg()', function () {
    it('should support Kinesis Objects', function (done) {
      var source = [ { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "VGhpcyBpcyB0ZXN0IGRhdGE=", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } } ];
      var target = { deaggregate: false };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "shardId-00000000005");
        assert.deepStrictEqual(result[0].data.toString(), "This is test data");
        done(err);
      })
    });
    it('should support multiple Kinesis Objects', function (done) {
      var source = [ 
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "VGhpcyBpcyB0ZXN0IGRhdGE=", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } },
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "VGhpcyBpcyBhbm90aGVyIHRlc3QgZGF0YQ==", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "2" } }
      ];
      var target = { deaggregate: false };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "shardId-00000000005");
        assert.deepStrictEqual(result[0].data.toString(), "This is test data");
        assert.strictEqual(result[1].key, "shardId-00000000005");
        assert.deepStrictEqual(result[1].data.toString(), "This is another test data");
        done(err);
      })
    });
  });
  describe('#Kinesis.deagg-no-kpl()', function () {
    it('should support Kinesis Objects', function (done) {
      var source = [
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "VGhpcyBpcyB0ZXN0IGRhdGE=", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } } 
      ];
      var target = { deaggregate: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "shardId-00000000005");
        assert.strictEqual(result[0].data.toString(), "This is test data");
        done(err);
      })
    });
    it('should support multiple Kinesis Objects', function (done) {
      var source = [ 
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "VGhpcyBpcyB0ZXN0IGRhdGE=", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } },
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "VGhpcyBpcyBhbm90aGVyIHRlc3QgZGF0YQ==", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "2" } }
      ];
      var target = { deaggregate: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result[0].key, "shardId-00000000005");
        assert.strictEqual(result[0].data.toString(), "This is test data");
        assert.strictEqual(result[1].key, "shardId-00000000005");
        assert.strictEqual(result[1].data.toString(), "This is another test data");
        done(err);
      })
    });
  });
  describe('#Kinesis.deagg-kpl()', function () {
    it('should support 0 KPL records', function (done) {
      var source = [
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "84mawtQdjNmPALIE6YAJmOz4Qn4", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } } 
      ];
      var target = { deaggregate: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result.length, 0);
        done(err);
      });
    });

    it('should support 1 KPL records', function (done) {
      var source = [
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "84mawgoFa2V5LTAaJQgAGiFUZXN0aW5nIEtQTCBBZ2dyZWdhdGVkIFJlY29yZCAxLTBlW2Hfd6iL1WkMbznr8jc2", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } } 
      ];
      var target = { deaggregate: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].key, "key-0");
        assert.strictEqual(result[0].data.toString(), "Testing KPL Aggregated Record 1-0");
        done(err);
      });
    });

    it('should support 2 KPL records', function (done) {
      var source = [
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "84mawgoFa2V5LTAKBWtleS0xGiUIABohVGVzdGluZyBLUEwgQWdncmVnYXRlZCBSZWNvcmQgMi0wGiUIARohVGVzdGluZyBLUEwgQWdncmVnYXRlZCBSZWNvcmQgMi0xHSUjhhzfXunP+g/ETnSEIQ==", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } } 
      ];
      var target = { deaggregate: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].key, "key-0");
        assert.strictEqual(result[0].data.toString(), "Testing KPL Aggregated Record 2-0");
        assert.strictEqual(result[1].key, "key-1");
        assert.strictEqual(result[1].data.toString(), "Testing KPL Aggregated Record 2-1");
        done(err);
      });
    });

    it('should support multiple KPL Objects', function (done) {
      var source = [ 
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "84mawgoFa2V5LTAaJQgAGiFUZXN0aW5nIEtQTCBBZ2dyZWdhdGVkIFJlY29yZCAxLTBlW2Hfd6iL1WkMbznr8jc2", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } },
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "84mawgoFa2V5LTAKBWtleS0xGiUIABohVGVzdGluZyBLUEwgQWdncmVnYXRlZCBSZWNvcmQgMi0wGiUIARohVGVzdGluZyBLUEwgQWdncmVnYXRlZCBSZWNvcmQgMi0xHSUjhhzfXunP+g/ETnSEIQ==", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } } 
      ];
      var target = { deaggregate: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0].key, "key-0");
        assert.strictEqual(result[0].data.toString(), "Testing KPL Aggregated Record 1-0");
        assert.strictEqual(result[1].key, "key-0");
        assert.strictEqual(result[1].data.toString(), "Testing KPL Aggregated Record 2-0");
        assert.strictEqual(result[2].key, "key-1");
        assert.strictEqual(result[2].data.toString(), "Testing KPL Aggregated Record 2-1");
        done(err);
      });
    });

    it('should support mixed Kinesis and KPL Objects', function (done) {
      var source = [ 
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "84mawgoFa2V5LTAaJQgAGiFUZXN0aW5nIEtQTCBBZ2dyZWdhdGVkIFJlY29yZCAxLTBlW2Hfd6iL1WkMbznr8jc2", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "1" } },
        { "awsRegion": "us-east-1", "eventID": "1", "eventName": "aws:kinesis:record", "eventSource": "aws:kinesis", "eventSourceARN": "arn:aws:kinesis:us-east-1:0123456789ab:stream/input", "eventVersion": "1.0", "invokeIdentityArn": "arn:aws:iam::0123456789ab:role/lambda_exec_role", "kinesis": { "data": "VGhpcyBpcyB0ZXN0IGRhdGE=", "kinesisSchemaVersion": "1.0", "partitionKey": "shardId-00000000005", "sequenceNumber": "2" } }
      ];
      var target = { deaggregate: true };
      transformation.transformRecords(source, target, function(err, result) {
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].key, "key-0");
        assert.strictEqual(result[0].data.toString(), "Testing KPL Aggregated Record 1-0");
        assert.strictEqual(result[1].key, "shardId-00000000005");
        assert.strictEqual(result[1].data.toString(), "This is test data");
        done(err);
      });
    });
  });
});
