#!/bin/bash
# AWS Lambda Fan-Out Utility
# 
# Copyright 2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# 
# Licensed under the Apache License, Version 2.0 (the "License").
# You may not use this file except in compliance with the License.
# A copy of the License is located at
# 
#  http://aws.amazon.com/apache2.0
# 
# or in the "license" file accompanying this file. This file is distributed
# on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
# express or implied. See the License for the specific language governing
# permissions and limitations under the License.

#
# This script stores the command line help functions
#

function helpActions {
  local PREFIX=""
  if [ -z "$ACTION" ]; then
    echo "Available actions are" 1>&2
    echo " - deploy: deploys the fanout function" 1>&2
    echo " - register <type>: creates a new mapping (source -> destination) for the specified fanout function" 1>&2
    echo " - list: lists existing destinations for the specified fanout function and source" 1>&2
    echo " - update: updates a mapping for the specified fanout function and source" 1>&2
    echo " - activate: activates a mapping for the specified fanout function" 1>&2
    echo " - deactivate: deactivates a mapping for the specified fanout function" 1>&2
    echo " - unregister: deletes a mapping for the specified fanout function" 1>&2
    echo " - destroy: destroys the fanout function" 1>&2
    echo " - hook: associates the fanout function to the specified source" 1>&2
    echo " - unhook: dissociates the fanout function from the specified source" 1>&2
    echo " - pause: pauses (deactivates) the fanout function on this specific source" 1>&2
    echo " - resume: pauses (activates) the fanout function on this specific source" 1>&2
  elif [ "$ACTION" == "deploy" ]; then
    echo "$0 deploy --function xxx [--subnet xxx] [--security-group xxx] ...: deploys the fanout function" 1>&2
  elif [ "$ACTION" == "register" ]; then
    echo "$0 register <type> --function xxx --source-type xxx --source xxx : creates a new mapping (source -> destination) for the specified fanout function" 1>&2
  elif [ "$ACTION" == "list" ]; then
    echo "$0 list --function xxx --source-type xxx --source xxx: lists existing destinations for the specified fanout function and source" 1>&2
  elif [ "$ACTION" == "update" ]; then
    echo "$0 update --function xxx --source-type xxx --source xxx --id xxx: updates a mapping for the specified fanout function and source" 1>&2
  elif [ "$ACTION" == "activate" ]; then
    echo "$0 activate --function xxx --source-type xxx --source xxx --id xxx: activates a mapping for the specified fanout function" 1>&2
  elif [ "$ACTION" == "deactivate" ]; then
    echo "$0 deactivate --function xxx --source-type xxx --source xxx --id xxx: deactivates a mapping for the specified fanout function" 1>&2
  elif [ "$ACTION" == "unregister" ]; then
    echo "$0 unregister --function xxx --source-type xxx --source xxx --id xxx: deletes a mapping for the specified fanout function" 1>&2
  elif [ "$ACTION" == "destroy" ]; then
    echo "$0 destroy --function xxx: destroys the fanout function and its associated configuration table" 1>&2
  elif [ "$ACTION" == "hook" ]; then
    echo "$0 destroy --function xxx --source-type xxx --source xxx: associates the fanout function to the specified source" 1>&2
  elif [ "$ACTION" == "unhook" ]; then
    echo "$0 destroy --function xxx --source-type xxx --source xxx: dissociates the fanout function from the specified source" 1>&2
  elif [ "$ACTION" == "pause" ]; then
    echo "$0 destroy --function xxx --source-type xxx --source xxx: pauses (deactivates) the fanout function on this specific source" 1>&2
  elif [ "$ACTION" == "resume" ]; then
    echo "$0 destroy --function xxx --source-type xxx --source xxx: pauses (activates) the fanout function on this specific source" 1>&2
  fi
}

function helpFunctionParams {
  echo "Common function parameters" 1>&2
  echo "  either" 1>&2
  echo "    --function <function-name>: the name of the AWS Lambda fanout function (will be validated)" 1>&2
  echo "  or" 1>&2
  echo "    --function-arn <function-arn>: the ARN of the AWS Lambda fanout function (will not be validated)" 1>&2
  echo "  either" 1>&2
  echo "    --table <name>: the name of the Amazon DynamoDB table used for configuration (will be validated)" 1>&2
  echo "  or" 1>&2
  echo "    --table-arn <arn>: the ARN of the Amazon DynamoDB table used for configuration (will not be validated)" 1>&2
  echo "  (Note: if --table and --table-arn are not specified, a table named '<function-name>Targets' will be used)" 1>&2
}

function helpCreateFunctionParams {
  echo "Function configuration" 1>&2
  echo "  either" 1>&2
  echo "    --function <function-name>: the name of the AWS Lambda function to deploy" 1>&2
  echo "  or" 1>&2
  echo "    --function-arn <function-arn>: the ARN of the AWS Lambda function to deploy" 1>&2
  echo "  either" 1>&2
  echo "    --table <name>: the name of the Amazon DynamoDB table used for configuration" 1>&2
  echo "  or" 1>&2
  echo "    --table-arn <arn>: the ARN of the Amazon DynamoDB table used for configuration" 1>&2
  echo "  --subnet <subnet-id>: comma separated list of subnet ids of the fanout function (Amazon VPC mode)" 1>&2
  echo "  --security-group <group-id>: comma separated list of security group ids of the fanout function (Amazon VPC mode)" 1>&2
  echo "  --exec-role <role-name>: the name of the AWS IAM Role used by the fanout function" 1>&2
  echo "  --exec-role-arn <role-arn>: the ARN of the AWS IAM Role used by the fanout function" 1>&2
  echo "  --memory <size>: size (in MiB) allocated to the fanout function" 1>&2
  echo "  --timeout <timeout>: timeout (in seconds) for the execution of the fanout function" 1>&2
  echo "  (Note: if --table and --table-arn are not specified, a table named '<function-name>Targets' will be used)" 1>&2
  echo "  (Note: resources [function, table, role] specified by ARN will not be validated)" 1>&2
}

function helpObjectProperties {
  echo "Target properties" 1>&2
  echo "  --active <flag>: sets the active status of the target" 1>&2
  echo "  --collapse <none|JSON|concat|concat-b64>: collapses multiple input messages into one output payload (IoT, SNS, SQS)" 1>&2
  echo "  --parallel <flag>: processes multiple messages in parallel for efficiency" 1>&2
  echo "  --convert-ddb <flag>: for Amazon DynamoDB Streams messages, converts the DDB objects to plain JavaScript objects" 1>&2
  echo "  --deaggregate <flag>: for Amazon Kinesis Streams messages, deserializes KPL (protobuf-based) messages" 1>&2
  echo "  --append-newlines <flag>: for Amazon DynamoDB Streams messages, append a newline to the end of each record" 1>&2
}

function helpTargetParams {
  echo "Target configuration" 1>&2
  if [ "${WORKER_TYPE}" == "sns" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For Amazon Simple Notification Service" 1>&2
    echo "    --destination <name>: name of the target Amazon SNS Topic (will be validated)" 1>&2
    echo "  or" 1>&2
    echo "    --destination <arn>: ARN of the target Amazon SNS Topic (will not be validated)" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "sqs" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For Amazon Simple Queue Service" 1>&2
    echo "    --destination <name>: name of the target Amazon SQS Queue (will be validated)" 1>&2
    echo "  or" 1>&2
    echo "    --destination <url>: URL of the target Amazon SQS Queue (will not be validated)" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "es" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For Amazon Elasticsearch Service" 1>&2
    echo "    --destination <name>: name of the target Amazon Elasticsearch Domain (will be validated)" 1>&2
    echo "    --index <doctype/index>: the specification of the index to use" 1>&2
    echo "  or" 1>&2
    echo "    --destination <endpoint#doctype/index>: Composite string containing the FQDN of the target Amazon Elasticache Service Domain endpoint, followed by '#' then the storage specification '<doctype>/<index>' (will not be validated)" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "kinesis" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For Amazon Kinesis Stream" 1>&2
    echo "    --destination <name>: name of the target Amazon Kinesis Stream (will be validated)" 1>&2
    echo "  or" 1>&2
    echo "    --destination <arn>: ARN of the target Amazon Kinesis Stream (will not be validated)" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "firehose" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For Amazon Kinesis Firehose Delivery Stream" 1>&2
    echo "    --destination <name>: name of the target Amazon Kinesis Firehose Delivery Stream (will be validated)" 1>&2
    echo "  or" 1>&2
    echo "    --destination <arn>: ARN of the target Amazon Kinesis Firehose Delivery Stream (will not be validated)" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "iot" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For AWS IoT MQTT topic" 1>&2
    echo "    --destination <name>: name of the target AWS IoT MQTT topic in the current account and region" 1>&2
    echo "  or" 1>&2
    echo "    --destination <url#topic>: Composite string containing the FQDN of the target Amazon IoT endpoint (specific per account / region), followed by '#' then the MQTT topic name" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "lambda" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For AWS Lambda Function" 1>&2
    echo "    --destination <name>: name of the target AWS Lambda Function (will be validated)" 1>&2
    echo "  or" 1>&2
    echo "    --destination <arn>: ARN of the target AWS Lambda Function (will not be validated)" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "memcached" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For Amazon ElastiCache Memcached Cluster" 1>&2
    echo "    --destination <name>: name of the target Amazon ElastiCache Memcached Cluster (will be validated)" 1>&2
    echo "  or" 1>&2
    echo "    --destination <endpoint>: FQDN of the target Amazon ElastiCache Memcached Cluster endpoint (will not be validated)" 1>&2
  fi
  if [ "${WORKER_TYPE}" == "redis" ] || [ -z "${WORKER_TYPE}" ]; then
    echo "  For Amazon ElastiCache Redis Replication Group" 1>&2
    echo "    --destination <name>: name of the target Amazon ElastiCache Redis Replication Group (will be validated)" 1>&2
    echo "  or" 1>&2
    echo "    --destination <endpoint>: FQDN of the target Amazon ElastiCache Redis Replication Group primary endpoint (will not be validated)" 1>&2
  fi
  echo "  --destination-region <region>: if specified, activates multi-region support (not for redis and memcached)" 1>&2
  echo "  --destination-role-arn <arn>: if specified, activates cross-account support (not for redis and memcached)" 1>&2
}

function helpWorkerParams {
  echo "Worker configuration" 1>&2
  echo "  either" 1>&2
  echo "    --source-type <type>: type of the associated event source (kinesis or dynamodb)" 1>&2
  echo "    --source <name>: the name of the Amazon Kinesis Stream or Amazon DynamoDB Stream event source" 1>&2
  echo "  or" 1>&2
  echo "    --source-arn <arn>: the ARN of the Amazon Kinesis Stream or Amazon DynamoDB Stream event source" 1>&2
  if [ "$ACTION" != "register" ] && [ "$ACTION" != "list" ]; then
    echo "  --id <worker-id>: identifier of the target worker" 1>&2
  fi
  echo "  (Note: resources [source] specified by ARN will not be validated)" 1>&2
}

function helpSourceParams {
  echo "Source configuration" 1>&2
  echo "  --batch-size <number>: maximum number of records to process per batch" 1>&2
  echo "  --active <true|false>: indicates is the source shoudl be directly activated" 1>&2
}

function helpCliParams {
  echo "Some parameters are used for the AWS CLI" 1>&2
  echo "  --profile <name>: the name of the profile to use" 1>&2
  echo "  --region <name>: the name of the AWS region to use" 1>&2
  echo "  --debug: activates debugging" 1>&2
  echo "  --endpoint-url <url>: specifies a specific URL for the service" 1>&2
  echo "  --no-verify-ssl: remove SSL certificate validation (not recommended)" 1>&2
}


HELP_STEPS=(helpActions)

function doHelp {
  local HELP_STEPS=(helpActions)
  if [ "$ACTION" == "register" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams" "helpObjectProperties" "helpTargetParams")
  elif [ "$ACTION" == "update" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams" "helpObjectProperties")
  elif [ "$ACTION" == "activate" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams")
  elif [ "$ACTION" == "deactivate" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams")
  elif [ "$ACTION" == "unregister" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams")
  elif [ "$ACTION" == "list" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams")
  elif [ "$ACTION" == "deploy" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpCreateFunctionParams")
  elif [ "$ACTION" == "destroy" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams")
  elif [ "$ACTION" == "hook" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams" "helpSourceParams")
  elif [ "$ACTION" == "unhook" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams")
  elif [ "$ACTION" == "pause" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams")
  elif [ "$ACTION" == "resume" ]; then
    HELP_STEPS=("helpActions" "helpCliParams" "helpFunctionParams" "helpWorkerParams")
  fi
  displayHelp ${HELP_STEPS[@]}
}

function displayHelp {
  while [ $# -ne 0 ]; do
    $1
    shift
    echo "" 1>&2
  done
}

