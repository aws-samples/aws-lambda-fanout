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
# This script manages the parameters and methods associated with the fanout function itself
#

## Reads the parameters required for the function, expects a first parameter specifying the current action
# All remaining parameters will be made available in the ${PASSTHROUGH[@]} array
function readFunctionParams {
  PASSTHROUGH=()
  FUNCTION_NAME=
  TABLE_NAME=
  TABLE_ARN=

  while [ $# -ne 0 ]; do
  	CODE=$1
    shift
    if [ "$CODE" == "--function" ]; then
      if [ $# -ne 0 ]; then
        FUNCTION_NAME=$1
        shift
      else
        echo "readFunctionParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--function-arn" ]; then
      if [ $# -ne 0 ]; then
        FUNCTION_ARN=$1
        shift
      else
        echo "readFunctionParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--table" ]; then
      if [ $# -ne 0 ]; then
        TABLE_NAME=$1
        shift
      else
        echo "readFunctionParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--table-arn" ]; then
      if [ $# -ne 0 ]; then
        TABLE_ARN=$1
        shift
      else
        echo "readFunctionParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [[ "$CODE" =~ ^--.* ]]; then
      PASSTHROUGH+=($CODE)
      if [ $# -ne 0 ]; then
        PASSTHROUGH+=($1)
        shift
      else
        echo "readFunctionParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    else
      PASSTHROUGH+=($CODE)
    fi
  done

  if [ -z "${FUNCTION_ARN}" ]; then
    if [ -z "${FUNCTION_NAME}" ]; then
      FUNCTION_NAME=fanout
      echo "No function name provided, using default name '${FUNCTION_NAME}'" 1>&2
    fi

    FUNCTION_ARN=$(aws lambda "get-function" "--function-name" ${FUNCTION_NAME} --query 'Configuration.FunctionArn' --output text ${CLI_PARAMS[@]} 2> /dev/null)
    if [ -z "${FUNCTION_ARN}" ] && [ "${ACTION}" != "deploy" ]; then
      echo "Unable to find specified AWS Lambda Function '${FUNCTION_NAME}'" 1>&2
      exit -1
    fi
  else
    FUNCTION_NAME=$( echo "$FUNCTION_ARN" | sed -E -n 's#^arn:aws:lambda:[a-z]+-[a-z]+-[0-9]:[0-9]{12}:function:([a-zA-Z0-9_-]{1,64})$#\1#p' )
    if [ -z "${FUNCTION_NAME}" ]; then
      echo "Invalid ARN '${FUNCTION_ARN}', must be a fully qualified AWS Lambda Function ARN" 1>&2
      exit -1
    fi
  fi

  if [ -z "${TABLE_ARN}" ]; then
    if [ -z "${TABLE_NAME}" ]; then
      TABLE_NAME=$(aws lambda get-function-configuration --function-name ${FUNCTION_NAME} --query 'Environment.Variables.TABLE_NAME' --output text 2> /dev/null)
       if [ $(echo $?) -eq 255 ]; then
      	TABLE_NAME=${FUNCTION_NAME}Targets
       fi
    fi

    TABLE_ARN=$(aws dynamodb describe-table --table-name ${TABLE_NAME} --query 'Table.TableArn' --output text ${CLI_PARAMS[@]} 2> /dev/null)
    if [ -z "${TABLE_ARN}" ] && [ "${ACTION}" != "deploy" ]; then
      echo "Unable to find specified source Amazon DynamoDB Table '${TABLE_NAME}' for function '${FUNCTION_NAME}'" 1>&2
      exit -1
    fi
  else
    TABLE_NAME=$( echo "$TABLE_ARN" | sed -E -n 's#^arn:aws:dynamodb:[a-z]+-[a-z]+-[0-9]:[0-9]{12}:table/([a-zA-Z0-9._-]{2,255})$#\1#p' )
    if [ -z "${TABLE_NAME}" ]; then
      echo "Invalid ARN '${TABLE_ARN}', must be a fully qualified AWS DynamoDB Table ARN" 1>&2
      exit -1
    fi
  fi
}

## Reads the parameters required for configuring the function (deploy)
# All remaining parameters will be made available in the ${PASSTHROUGH[@]} array
function readFunctionConfigParams {
  PASSTHROUGH=()

  SUBNETS=
  EXEC_ROLE_NAME=
  EXEC_ROLE_ARN=
  MEMORY_SIZE=128
  TIMEOUT=30
  SECURITY_GROUPS=

  while [ $# -ne 0 ]; do
    CODE=$1
    shift
    if [ "$CODE" == "--subnet" ]; then
      if [ $# -ne 0 ]; then
        if [ -z "$SUBNETS" ]; then
          SUBNETS="SubnetIds=$1"
        else
          SUBNETS="${SUBNETS},$1"
        fi
        shift
      else
        echo "readFunctionConfigParams: You must specify a subnet id for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--security-group" ]; then
      if [ $# -ne 0 ]; then
        if [ -z "$SECURITY_GROUPS" ]; then
          SECURITY_GROUPS="SecurityGroupIds=$1"
        else
          SECURITY_GROUPS="${SECURITY_GROUPS},$1"
        fi
        shift
      else
        echo "readFunctionConfigParams: You must specify a security group id for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--exec-role" ]; then
      if [ $# -ne 0 ]; then
        EXEC_ROLE_NAME=$1
        shift
      else
        echo "readFunctionConfigParams: You must specify an AWS IAM Role Name for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--exec-role-arn" ]; then
      if [ $# -ne 0 ]; then
        EXEC_ROLE_ARN=$1
        shift
      else
        echo "readFunctionConfigParams: You must specify an AWS IAM Role ARN for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--memory" ]; then
      if [ $# -ne 0 ]; then
        MEMORY_SIZE=$1
        shift
      else
        echo "readFunctionConfigParams: You must specify a memory limit in MiB for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--timeout" ]; then
      if [ $# -ne 0 ]; then
        TIMEOUT=$1
        shift
      else
        echo "readFunctionConfigParams: You must specify a timeout in seconds for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [[ "$CODE" =~ ^--.* ]]; then
      PASSTHROUGH+=($CODE)
      if [ $# -ne 0 ]; then
        PASSTHROUGH+=($1)
        shift
      else
        echo "readFunctionConfigParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    else
      PASSTHROUGH+=($CODE)
    fi
  done
}

## Deploys a fanout function (creation or update), the associated Amazon DynamoDB table and AWS IAM Role
function deployFanout {
  OLD=$PWD
  cd "$DIR"
  if [ -f "fanout.zip" ]; then
    rm fanout.zip
  fi
  npm install
  ZIP_EXE=$(which zip 2> /dev/null)
  if [ -z "$ZIP_EXE" ]; then
    WIN_7Z_EXE=$(which 7z 2> /dev/null)
    if [ -z "$WIN_7Z_EXE" ]; then
      echo "Unable to find suitable 'zip' or '7z' command" 1>&2
      exit -1
    else
      7z a -r fanout.zip fanout.js node_modules lib
    fi
  else
    zip -q -r fanout.zip fanout.js node_modules lib
  fi

  if [ -z "$FUNCTION_ARN" ]; then
    # Will be empty if we need to create the function
    if [ -z "$TABLE_ARN" ]; then
      TABLE_ARN=$(aws dynamodb create-table --table-name ${TABLE_NAME} --attribute-definitions AttributeName=sourceArn,AttributeType=S AttributeName=id,AttributeType=S --key-schema AttributeName=sourceArn,KeyType=HASH AttributeName=id,KeyType=RANGE --provisioned-throughput ReadCapacityUnits=10,WriteCapacityUnits=1 --query 'TableDescription.TableArn' --output text ${CLI_PARAMS[@]} 2> /dev/null)
      echo "Created Amazon DynamoDB $TABLE_NAME with ARN: $TABLE_ARN"
    fi
  
    if [ -z "$EXEC_ROLE_ARN" ]; then
      if [ -z "$EXEC_ROLE_NAME" ]; then
        EXEC_ROLE_NAME=${FUNCTION_NAME}Role
      fi

      # Search for an existing one by name
      EXEC_ROLE_ARN=$(aws iam get-role --role-name $EXEC_ROLE_NAME --query 'Role.Arn' --output text ${DESTINATION_SEARCH_ARGS[@]} 2> /dev/null)
      if [ -z "$EXEC_ROLE_ARN" ]; then
        # Create the role if we don't have one
        EXEC_ROLE_ARN=$(aws iam create-role --role-name $EXEC_ROLE_NAME --assume-role-policy-document '{"Version": "2012-10-17", "Statement": [{"Action": "sts:AssumeRole", "Principal": {"Service": "lambda.amazonaws.com"}, "Effect": "Allow", "Sid": ""}]}' --query 'Role.Arn' --output text ${CLI_PARAMS[@]})
        if [ -z "${EXEC_ROLE_ARN}" ]; then
          echo "Unable to create specified AWS IAM Role '${EXEC_ROLE_NAME}'" 1>&2
          cd "$OLD"
          exit -1
        fi
        aws iam attach-role-policy --role-name $EXEC_ROLE_NAME --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess ${CLI_PARAMS[@]}
        aws iam attach-role-policy --role-name $EXEC_ROLE_NAME --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaDynamoDBExecutionRole ${CLI_PARAMS[@]}
        aws iam attach-role-policy --role-name $EXEC_ROLE_NAME --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaKinesisExecutionRole ${CLI_PARAMS[@]}
        aws iam attach-role-policy --role-name $EXEC_ROLE_NAME --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole ${CLI_PARAMS[@]}
        aws iam put-role-policy --role-name $EXEC_ROLE_NAME --policy-name ReadConfiguration --policy-document '{"Version": "2012-10-17", "Statement": [{"Action": ["dynamodb:Query"], "Resource": ["'$TABLE_ARN'"], "Effect": "Allow"}]}' ${CLI_PARAMS[@]}
        aws iam put-role-policy --role-name $EXEC_ROLE_NAME --policy-name PublishData --policy-document '{"Version": "2012-10-17", "Statement": [{"Action": ["sts:AssumeRole","kinesis:PutRecord*","sqs:SendMessage*","sns:Publish","firehose:PutRecordBatch","iot:Publish*","lambda:Invoke*","es:ESHttpPost"], "Resource": ["*"], "Effect": "Allow", "Sid": ""}]}' ${CLI_PARAMS[@]}
        echo "Created AWS IAM Role $EXEC_ROLE_NAME with ARN: $EXEC_ROLE_ARN"
        echo "... Sleeping for 10 seconds to ensure the role has been propagated ..."
        sleep 10
      fi
    else
      EXEC_ROLE_NAME=$( echo "$EXEC_ROLE_ARN" | sed -E -n 's#^arn:aws:iam::role/([a-zA-Z0-9+=,.@_-]{1,64})$#\1#p' )
      if [ ! -z "$EXEC_ROLE_NAME" ]; then
        echo "Invalid ARN '${TABLE_ARN}', must be a fully qualified AWS IAM Role ARN" 1>&2
        cd "$OLD"
        exit -1
      fi
    fi

    VPC_PARAMS=()
    if [ ! -z "$SUBNETS" ] || [ ! -z "$SECURITY_GROUPS" ]; then
      VPC_PARAMS+=("--vpc-config")
      if [ ! -z "$SUBNETS" ] && [ ! -z "$SECURITY_GROUPS" ]; then
        VPC_PARAMS+=("${SUBNETS},${SECURITY_GROUPS}")
      elif [ !-z "$SUBNETS" ]; then
        VPC_PARAMS+=("${SUBNETS}")
      else
        VPC_PARAMS+=("${SECURITY_GROUPS}")
      fi
    fi

    FUNCTION_ARN=$(aws lambda "create-function" --function-name $FUNCTION_NAME --runtime nodejs4.3 --description "This is an Amazon Kinesis and Amazon DynamoDB Streams fanout function, look at $TABLE_NAME DynamoDB table for configuration" --handler fanout.handler --role $EXEC_ROLE_ARN --environment Variables={TABLE_NAME=$TABLE_NAME} --memory-size $MEMORY_SIZE --timeout $TIMEOUT --zip-file fileb://fanout.zip ${VPC_PARAMS[@]} --query 'FunctionArn' --output text ${CLI_PARAMS[@]})
    if [ -z "${FUNCTION_ARN}" ]; then
      echo "Unable to create specified AWS Lambda Function '${FUNCTION_NAME}'" 1>&2
      cd "$OLD"
      exit -1
    fi
    echo "Created AWS Lambda Function $FUNCTION_NAME with ARN: $FUNCTION_ARN"
  else
    FUNCTION_ARN=$(aws lambda update-function-code --function-name ${FUNCTION_NAME} --zip-file fileb://fanout.zip --query 'FunctionArn' --output text ${CLI_PARAMS[@]})
    if [ -z "${FUNCTION_ARN}" ]; then
      echo "Unable to update specified AWS Lambda Function '${FUNCTION_NAME}'" 1>&2
      cd "$OLD"
      exit -1
    fi
    echo "Updated AWS Lambda Function $FUNCTION_NAME with ARN: $FUNCTION_ARN"
  fi 

  rm fanout.zip
  cd "$OLD"
}

## Destroys a fanout function and its associated Amazon DynamoDB table
function destroyFanout {
  aws dynamodb delete-table --table-name ${TABLE_NAME} ${CLI_PARAMS[@]} > /dev/null
  aws lambda "delete-function" --function-name ${FUNCTION_NAME} ${CLI_PARAMS[@]} > /dev/null
  echo "Please check for the AWS IAM Role, we did not delete this"
}

