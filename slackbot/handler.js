const querystring = require('querystring');
const AWS = require('aws-sdk');

const streamArnRegEx = /^arn:aws:kinesis:[a-z0-9\-]*:[0-9]{12}:stream\/(.*Stream)$/;
const uniqueIdRegEx = /^arn:aws:kinesis:[a-z0-9\-]*:[0-9]{12}:stream\/(.*)Stream$/;
const roleArnRegEx = /^arn:aws:iam::[0-9]{12}:role\/.*StreamWriter$/;

AWS.config.update({
    region: process.env.CORE_STREAM_REGION
});

function validateRoleArn(roleArn) {
    return !(roleArn.match(roleArnRegEx) === null);
}

function validateKinesisArn(streamArn) {
    return !(streamArn.match(streamArnRegEx) === null);
}

function getRetailStreamArn() {
    return `arn:aws:kinesis:${process.env.CORE_STREAM_REGION}:${process.env.CORE_STREAM_ACCOUNT}:stream/${process.env.HELLO_RETAIL_STAGE}RetailStream`
}

function extractUniqueIdFromStreamArn(roleArn) {
    return roleArn.match(uniqueIdRegEx)[1];
}

function extractStreamName(streamArn) {
    return streamArn.match(streamArnRegEx)[1];
}

function handleSlackbotMessage(streamAction, event, callback) {
    const query = querystring.parse(event.body);
    const args = query.text.split(' ');
    let message = 'WOAH!';

    // Validate environment:
    if(!process.env.CORE_STREAM_REGION) {
        // CORE_STREAM_REGION is the AWS region for the workshop
        message = 'Invalid deployment of this Lambda: CORE_STREAM_REGION must be set.'
    } else if(!process.env.CORE_STREAM_ACCOUNT) {
        // CORE_STREAM_ACCOUNT account number for source Retail Stream
        message = 'Invalid deployment of this Lambda: CORE_STREAM_ACCOUNT must be set.'
    } else if(!process.env.HELLO_RETAIL_STAGE) {
        // HELLO_RETAIL_STAGE set to the stage name for the workshop, e.g. 'workshop050217' or 'austin'
        message = 'Invalid deployment of this Lambda: HELLO_RETAIL_STAGE must be set.'
    } else {
        message = streamAction(args, query);
    }

    callback(null, {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {  },
        body: message
    })
}

function registerStream(args, query) {
    if(args.length != 2) {
        message = 'Invalid arguments. Expected: <writer-role-arn> <stream-arn>'
    } else {
        const roleArn = args[0];
        const streamArn = args[1];

        if(!validateRoleArn(roleArn)) {
            message = `Expected the *StreamWriter role ARN, but saw ${roleArn} instead.`
        } else if (!validateKinesisArn(streamArn)) {
            message = `Expected the *Stream ARN, but saw ${streamArn} instead.`
        } else {
            message = `Thanks ${query.user_name}! We're connecting the ${process.env.HELLO_RETAIL_STAGE} core Retail Stream to ${streamArn} using ${roleArn}.`
            registerStreamForFanOut(roleArn, streamArn);
        }
    }

    return message;
}

function registerStreamForFanOut(roleArn, streamArn) {
    const dynamoDb = new AWS.DynamoDB();
    const retailStreamArn = getRetailStreamArn();
    const id = extractUniqueIdFromStreamArn(streamArn);
    const destination = extractStreamName(streamArn);

    const item = {
        'active': { 'BOOL': true },
        'collapse': { 'S': 'none' },
        'destination': { 'S': destination },
        'id': { 'S': id },
        'parallel': { 'BOOL': false },
        'region': { 'S': process.env.CORE_STREAM_REGION },
        'role': { 'S': roleArn },
        'sourceArn': { 'S': retailStreamArn },
        'type': { 'S': 'kinesis' }
    };

    console.log(item);

    dynamoDb.putItem({
        'TableName': process.env.FANOUT_TABLE_NAME,
        'Item': item
    }, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else     console.log(data);           // successful response
    });
}


function unregisterStream(args, query) {
    if(args.length != 1) {
        message = 'Invalid arguments. Expected: <stream-arn>'
    } else {
        const streamArn = args[0];

        if (!validateKinesisArn(streamArn)) {
            message = `Expected the *Stream ARN, but saw ${streamArn} instead.`
        } else {
            message = `Thanks ${query.user_name}! We're disconnecting the ${process.env.HELLO_RETAIL_STAGE} core Retail Stream from ${streamArn}.`
            unregisterStreamForFanOut(streamArn);
        }
    }

    return message;
}

function unregisterStreamForFanOut(streamArn) {
    const dynamoDb = new AWS.DynamoDB();
    const retailStreamArn = getRetailStreamArn();
    const id = extractUniqueIdFromStreamArn(streamArn);
    const destination = extractStreamName(streamArn);

    const keys = {
        'sourceArn': { 'S': retailStreamArn },
        'id': { 'S': id }
    };

    console.log(keys);

    dynamoDb.deleteItem({
        'TableName': process.env.FANOUT_TABLE_NAME,
        'Key': keys
    }, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else     console.log(data);           // successful response
    });
}


module.exports = {
    hookstream: function (event, context, callback) {
        handleSlackbotMessage(registerStream, event, callback);
    },
    unhookstream: function (event, context, callback) {
        handleSlackbotMessage(unregisterStream, event, callback);
    },
}