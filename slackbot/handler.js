const querystring = require('querystring');

module.exports = {
    hookstream: function (event, context, callback) {
        console.log(event, context)

        const query = querystring.parse(event.body)

        console.log(query.user_name)
        console.log(query.text)

        const args = query.text.split(' ')
        let message = 'WOAH!';

        if(args.length != 2) {
            message = 'Invalid arguments. Expected: <writer-role-arn> <stream-arn>'
        } else {
            const roleArn = args[0];
            const streamArn = args[1];

            if(!roleArn.match(/^arn:aws:iam::[0-9]{12}:role\/.*StreamWriter$/)) {
                message = `Expected the *StreamWriter role ARN, but saw ${roleArn} instead.`
            } else if (!streamArn.match(/^arn:aws:kinesis:[a-z0-9\-]*:[0-9]{12}:stream\/.*Stream$/)) {
                message = `Expected the *Stream ARN, but saw ${streamArn} instead.`
            } else {
                message = `Connecting Hello-Retail Stream to ${streamArn} using ${roleArn}.`
            }
        }

        callback(null, {
            isBase64Encoded: false,
            statusCode: 200,
            headers: {  },
            body: message
        })
    },
    unhookstream: function(event, context, callback) {
        console.log(event, context)
        callback(null, {
            isBase64Encoded: false,
            statusCode: 200,
            headers: {  },
            body: "Hello from Lambda!"
        })
    }
}
