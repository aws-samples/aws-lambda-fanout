#!/usr/bin/env bash
if [ -z $1 ] || [ -z $STAGE ] || [ -z $REGION ] || [ -z $TARGET_ACCT ]
    then
        echo "Usage: register-student-sandbox-stream <lanid>"
        echo "NOTE! The following environment variables must be set:"
        echo "STAGE, name of the workshop stage."
        echo "REGION, workshop region."
        echo "TARGET_ACCT, workshop sandbox account."
        exit 1
fi

RETAIL_STREAM_NAME=`aws kinesis list-streams | sed -n "s/^.*\"\(.*\)\".*/\1/p" | grep ${STAGE}RetailStream`

if [ -z $RETAIL_STREAM_NAME ]
    then
        echo "ERROR: Did not find RetailStream for environment $STAGE."
        exit 2
    else
        echo "Finding ARN for stream $RETAIL_STREAM_NAME ..."
fi

RETAIL_STREAM_ARN=`aws kinesis describe-stream --stream-name $RETAIL_STREAM_NAME | grep StreamARN | sed -n "s/^.*\(arn\:aws\:kinesis\:.*RetailStream\).*/\1/p"`

if [ -z $RETAIL_STREAM_ARN ]
    then
        echo "ERROR: Did not find RetailStream ARN for $RETAIL_STREAM_NAME."
        exit 3
    else
        echo "Invoking './fanout' to attach stream $RETAIL_STREAM_ARN ..."
fi

./fanout register kinesis --source-arn $RETAIL_STREAM_ARN --id $1  --destination-region $REGION --active true --parallel false --destination-role-arn arn:aws:iam::${TARGET_ACCT}:role/${1}StreamWriter --destination arn:aws:kinesis:us-west-2:${TARGET_ACCT}:stream/${1}Stream

if [ $? ]
    then
        echo "DONE. Student stream attached."
    else
        echo "ERROR. See output from './fanout' above."
        exit 4
fi
