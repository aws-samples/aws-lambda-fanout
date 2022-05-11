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
 * This Node.js script tests the features from the ddb-utils.js script
 */

var DDB = require('../lib/ddb-utils.js');

var assert = require('assert');

describe('ddb-utils', function() {
  describe('#duplicateObject()', function () {
    it('should support null, string, int, Date', function () {
      var source = null;
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = "string1";
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = "";
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = 0;
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = 1000.1;
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = -1000.1;
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = true;
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = false;
      assert.strictEqual(DDB.duplicateObject(source), source);
      source = new Date();
      assert.strictEqual(DDB.duplicateObject(source), source);
    });
    it('should support arrays', function () {
      var source = [];
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = [1, 2, 3];
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = [1, "2", 3];
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = [1, "2", false];
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = [1, "2", false, []];
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = [1, "2", false, [12, "b"]];
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = [1, "2", false];
      var copy = DDB.duplicateObject(source);
      assert.deepEqual(copy, source);
      source[1] = "3";
      assert.notDeepStrictEqual(copy, source);
    });
    it('should support objects', function () {
      var source = {};
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = { a: 1 };
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = { a: 1, b: "2" };
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = { a: 1, b: "2", c: false };
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = { a: 1, b: "2", c: false, d: [3, "4", true] };
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = { a: 1, b: "2", c: false, d: [3, "4", true], e: { f: 5, g: "6"} };
      assert.deepStrictEqual(DDB.duplicateObject(source), source);
      source = { a: 1, b: "2" };
      var copy = DDB.duplicateObject(source);
      assert.deepEqual(copy, source);
      source.a = 2;
      assert.notDeepStrictEqual(copy, source);
    });
  });

  describe('#parseDynamoDBPropertyValue()', function () {
    it('should support S, N, B, NULL, BOOL', function () {
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ NULL: true}), null);
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ S: "" }), "");
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ S: "string1" }), "string1");
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ N: "0" }), 0.0);
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ N: "1000.1" }), 1000.1);
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ N: "-1000.1" }), -1000.1);
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ BOOL: true }), true);
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ BOOL: false }), false);
      assert.strictEqual(DDB.parseDynamoDBPropertyValue({ B: "YjY0VmFs" }), Buffer.from("b64Val").toString('base64'));
    });
    it('should support SS, NS ans BS', function () {
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ SS: [ "", "string1", "string2" ]}), [ "", "string1", "string2" ]);
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ NS: [ "0", "1000.1", "-1000.1" ]}), [ 0, 1000.1, -1000.1 ]);
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ BS: [ "YjY0dmFs", "YjY0VmFs" ]}).map(function(t) { return t.toString() }), [ Buffer.from("b64val").toString('base64'), Buffer.from("b64Val").toString('base64') ]);
    });
    it('should support map and list', function () {
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ M: { a: { NULL: true }, b: { S: "string1" }, c: { N: "1000.1" }, d: { BOOL: true } }}), { a: null, b: "string1", c: 1000.1, d: true });
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ L: [ { NULL: true }, { S: "string1" }, { N: "1000.1" }, { BOOL: true } ]}), [null, "string1", 1000.1, true]);
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ M: { a: { NULL: true }, b: { S: "string1" }, c: { N: "1000.1" }, d: { BOOL: true }, e: { L: [ { NULL: true }, { S: "string1" }, { N: "1000.1" }, { BOOL: true } ]} }}), { a: null, b: "string1", c: 1000.1, d: true, e: [null, "string1", 1000.1, true] });
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ L: [ { NULL: true }, { S: "string1" }, { N: "1000.1" }, { BOOL: true }, { M: { a: { NULL: true }, b: { S: "string1" }, c: { N: "1000.1" }, d: { BOOL: true } }} ]}), [null, "string1", 1000.1, true, { a: null, b: "string1", c: 1000.1, d: true }]);
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ M: { a: { NULL: true }, b: { S: "string1" }, c: { N: "1000.1" }, d: { BOOL: true }, e: { M: { a: { NULL: true }, b: { S: "string1" }, c: { N: "1000.1" }, d: { BOOL: true } }} }}), { a: null, b: "string1", c: 1000.1, d: true, e: { a: null, b: "string1", c: 1000.1, d: true } });
      assert.deepStrictEqual(DDB.parseDynamoDBPropertyValue({ L: [ { NULL: true }, { S: "string1" }, { N: "1000.1" }, { BOOL: true }, { L: [ { NULL: true }, { S: "string1" }, { N: "1000.1" }, { BOOL: true } ]} ]}), [null, "string1", 1000.1, true, [null, "string1", 1000.1, true]]);
    });
    it('should throw on invalid values', function () {
      assert.throws(function() { DDB.parseDynamoDBPropertyValue() }, /Can not process null or undefined properties/);
      assert.throws(function() { DDB.parseDynamoDBPropertyValue(null) }, /Can not process null or undefined properties/);
      assert.throws(function() { DDB.parseDynamoDBPropertyValue({}) }, /Can not process empty properties/);
      assert.throws(function() { DDB.parseDynamoDBPropertyValue({ Z: 0 }) }, /Unknown property type Z/);
    });
  });

  describe('#parseDynamoDBObject()', function () {
    it('should support null and empty objects', function () {
      assert.deepStrictEqual(DDB.parseDynamoDBObject(null), {});
      assert.deepStrictEqual(DDB.parseDynamoDBObject({}), {});
    });
    it('should support one or multiple properties', function () {
      assert.deepStrictEqual(DDB.parseDynamoDBObject({ a: { S: "string1" } }), { a: "string1" });
      assert.deepStrictEqual(DDB.parseDynamoDBObject({ a: { S: "string1" }, b: { N: "1" } }), { a: "string1", b: 1 });
    });
    it('should support default values', function () {
      var defaultValue = { b: 1 };
      assert.deepStrictEqual(DDB.parseDynamoDBObject(null, defaultValue), { b: 1 });
      assert.deepStrictEqual(DDB.parseDynamoDBObject({}, defaultValue), { b: 1 });
      assert.deepStrictEqual(DDB.parseDynamoDBObject({ a: { S: "string1" } }, defaultValue), { a: "string1", b: 1 });
      assert.deepStrictEqual(DDB.parseDynamoDBObject({ b: { S: "string1" } }, defaultValue), { b: "string1" });
    });
  });
});
