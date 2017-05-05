#!/usr/bin/env bash
if [ -z $1 ] || [ -z $2 ] || [ -z $STAGE ] || [ -z $REGION ]
    then
        echo "Usage: register-student-stream <role-arn> <stream-arn>"
        echo "NOTE! The following environment variables must be set:"
        echo "STAGE, name of the workshop stage."
        echo "REGION, workshop region."
        exit 1
fi

if ! echo $1 | grep -q "role"
    then
        echo "ERROR: First argument must be the role ARN."
        exit 1
fi

if ! echo $2 | grep -q "kinesis"
    then
        echo "ERROR: Second argument must be the stream ARN."
        exit 1
fi


UNIQUE_ID=`echo $1 | sed -n "s/^arn\:aws\:iam\:\:[0-9]*\:role\/\(.*\)StreamWriter.*/\1/p"`

echo "Using unique id ${UNIQUE_ID}"

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

./fanout register kinesis --source-arn $RETAIL_STREAM_ARN --id $UNIQUE_ID  --destination-region $REGION --active true --parallel false --destination-role-arn $1 --destination $2

if [ $? ]
    then
        echo "DONE. Student stream attached."
    else
        echo "ERROR. See output from './fanout' above."
        exit 4
fi
