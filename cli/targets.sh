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
# This script manages the parameters and methods of the targets of the fanout function
#

## Manages the identification of a worker (a source and an id)
# All remaining parameters will be made available in the ${PASSTHROUGH[@]} array
function readWorkerParams {
  PASSTHROUGH=()
  WORKER_ID=
  SOURCE_ARN=
  SOURCE_NAME=
  SOURCE_TYPE=

  while [ $# -ne 0 ]; do
    CODE=$1
    shift
    if [ "$CODE" == "--source" ]; then
      if [ $# -ne 0 ]; then
        SOURCE_NAME=$1
        shift
      else
        echo "readWorkerParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--source-type" ]; then
      if [ $# -ne 0 ]; then
        SOURCE_TYPE=$1
        shift
      else
        echo "readWorkerParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--source-arn" ]; then
      if [ $# -ne 0 ]; then
        SOURCE_ARN=$1
        shift
      else
        echo "readWorkerParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--id" ]; then
      if [ $# -ne 0 ]; then
        WORKER_ID=$1
        shift
      else
        echo "readWorkerParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [[ "$CODE" =~ ^--.* ]]; then
      PASSTHROUGH+=($CODE)
      if [ $# -ne 0 ]; then
        PASSTHROUGH+=($1)
        shift
      else
        echo "readWorkerParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    else
      PASSTHROUGH+=($CODE)
    fi
  done

  if [ -z "${WORKER_ID}" ] && [ "${ACTION}" != "list" ] && [ "${ACTION}" != "hook" ] && [ "${ACTION}" != "unhook" ] && [ "${ACTION}" != "pause" ] && [ "${ACTION}" != "resume" ]; then
    echo "readWorkerParams: Invalid parameters, you must specify --id" 1>&2
    doHelp
    exit -1
  fi

  if [ -z "${SOURCE_ARN}" ]; then
    if [ -z "${SOURCE_NAME}" ]; then
      echo "readWorkerParams: Invalid parameters, you must either specify --source and --source-type or --source-arn" 1>&2
      doHelp
      exit -1
    fi

    if [ "${SOURCE_TYPE}" == "kinesis" ]; then
      SOURCE_ARN=$(aws kinesis describe-stream --stream-name ${SOURCE_NAME} --query 'StreamDescription.StreamARN' --output text --no-paginate ${CLI_PARAMS[@]} 2> /dev/null)
      if [ -z "${SOURCE_ARN}" ] || [ "${SOURCE_ARN}" == "None" ]; then
        echo "readWorkerParams: Unable to find specified source Amazon Kinesis Stream '${SOURCE_NAME}'" 1>&2
        exit -1
      fi
    elif [ "${SOURCE_TYPE}" == "dynamodb" ]; then
      SOURCE_ARN=$(aws dynamodbstreams list-streams --table-name ${SOURCE_NAME} --query 'Streams[0].StreamArn' --output text --no-paginate ${CLI_PARAMS[@]} 2> /dev/null)
      if [ -z "${SOURCE_ARN}" ] || [ "${SOURCE_ARN}" == "None" ]; then
        echo "readWorkerParams: Unable to find specified source Amazon DynamoDB Stream associated to Amazon DynamoDB Table '${SOURCE_NAME}'" 1>&2
        exit -1
      fi
    else
      echo "readWorkerParams: Invalid parameters, you must specify a valid --source-type (accepted are kinesis and dynamodb)" 1>&2
      doHelp
      exit -1
    fi
  else
    SOURCE_NAME=$( echo "$SOURCE_ARN" | sed -E -n 's#^arn:aws:kinesis:[a-z]+-[a-z]+-[0-9]:[0-9]{12}:stream/([a-zA-Z0-9_-]{1,128})$#\1#p' )
    if [ ! -z "$SOURCE_NAME" ]; then
      SOURCE_TYPE=kinesis
    else
      SOURCE_NAME=$( echo "$SOURCE_ARN" | sed -E -n 's#^arn:aws:dynamodb:[a-z]+-[a-z]+-[0-9]:[0-9]{12}:table/([a-zA-Z0-9._-]{2,255})$#\1#p' )
      if [ ! -z "$SOURCE_NAME" ]; then
        SOURCE_TYPE=dynamodb
      else
        echo "readWorkerParams: Invalid parameters, you must specify a valid Amazon DynamoDB Stream or Amazon Kinesis Stream ARN for --source-arn" 1>&2
        doHelp
        exit -1
      fi
    fi
  fi
}

## Manages the configuration of the registration of a source
# All remaining parameters will be made available in the ${PASSTHROUGH[@]} array
function readSourceConfigParams {
  PASSTHROUGH=()

  BATCH_SIZE=
  STARTING_POSITION=

  while [ $# -ne 0 ]; do
    CODE=$1
    shift
    if [ "$CODE" == "--batch-size" ]; then
      if [ $# -ne 0 ]; then
        BATCH_SIZE=$1
        shift
      else
        echo "readSourceConfigParams: You must specify a subnet id for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--starting-position" ]; then
      if [ $# -ne 0 ]; then
        STARTING_POSITION=$1
        shift
      else
        echo "readSourceConfigParams: You must specify a security group id for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [[ "$CODE" =~ ^--.* ]]; then
      PASSTHROUGH+=($CODE)
      if [ $# -ne 0 ]; then
        PASSTHROUGH+=($1)
        shift
      else
        echo "readSourceConfigParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    else
      PASSTHROUGH+=($CODE)
    fi
  done
}

## Manages the identification of a target (a destination, region, role)
# All remaining parameters will be made available in the ${PASSTHROUGH[@]} array
function readTargetParams {
  PASSTHROUGH=()
  DESTINATION_SEARCH_ARGS=(${CLI_PARAMS[@]})
  DESTINATION_NAME=
  DESTINATION_INDEX=
  DESTINATION_REGION=
  DESTINATION_ROLE_ARN=
  EXTERNAL_ID=

  while [ $# -ne 0 ]; do
    CODE=$1
    shift
    if [ "$CODE" == "--destination" ]; then
      if [ $# -ne 0 ]; then
        DESTINATION_NAME=$1
        shift
      else
        echo "readTargetParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--index" ]; then
      if [ "$WORKER_TYPE" != "es" ]; then
        echo "Parameter --index is only available for Amazon Elasticsearch Service targets" 1>&2
        doHelp
        exit -1
      fi
      if [ $# -ne 0 ]; then
        DESTINATION_INDEX=$1
        shift
      else
        echo "readTargetParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--destination-region" ]; then
      if [ $# -ne 0 ]; then
        DESTINATION_REGION=$1
        shift
        DESTINATION_SEARCH_ARGS=(${CLI_PARAMS_NO_REGION[@]})
        DESTINATION_SEARCH_ARGS+=("--region")
        DESTINATION_SEARCH_ARGS+=($DESTINATION_REGION)
      else
        echo "readTargetParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--destination-role-arn" ]; then
      if [ $# -ne 0 ]; then
        DESTINATION_ROLE_ARN=$1
        shift
      else
        echo "readTargetParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--external-id" ]; then
      if [ $# -ne 0 ]; then
        EXTERNAL_ID=$1
        shift
      else
        echo "readTargetParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [[ "$CODE" =~ ^--.* ]]; then
      PASSTHROUGH+=($CODE)
      if [ $# -ne 0 ]; then
        PASSTHROUGH+=($1)
        shift
      else
        echo "readTargetParams: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    else
      PASSTHROUGH+=($CODE)
    fi
  done

  if [ ! -z "${DESTINATION_ROLE_ARN}" ]; then
    DESTINATION_ROLE_NAME=$( echo "$DESTINATION_ROLE_ARN" | sed -E -n 's#^arn:aws:iam::[0-9]{12}:role/([a-zA-Z0-9+=,.@_-]{1,64})$#\1#p' )
    if [ -z "${DESTINATION_ROLE_NAME}" ]; then
      echo "Invalid ARN '${DESTINATION_ROLE_ARN}', must be a fully qualified AWS IAM Role ARN" 1>&2
      exit -1
    fi
  fi

  if [ ! -z "${DESTINATION_REGION}" ]; then
    DESTINATION_REGION_NAME=$( echo "$DESTINATION_REGION" | grep -E -e '^[a-z]+-[a-z]+-[0-9]$' )
    if [ -z "${DESTINATION_REGION_NAME}" ]; then
      echo "Invalid region name '${DESTINATION_REGION}', must be a valid AWS region name" 1>&2
      exit -1
    fi
  fi
}

## Manages the attributes of a target (active, collapse, parallel)
# All remaining parameters will be made available in the ${PASSTHROUGH[@]} array
function readObjectProperties {
  PASSTHROUGH=()
  ACTIVE=
  COLLAPSE=
  PARALLEL=
  CONVERT_DDB=
  DEAGGREGATE=
  APPEND_NEWLINES=

  while [ $# -ne 0 ]; do
    CODE=$1
    shift
    if [ "$CODE" == "--active" ]; then
      if [ $# -ne 0 ]; then
        ACTIVE=$1
        shift
      else
        echo "readObjectProperties: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--collapse" ]; then
      if [ $# -ne 0 ]; then
        COLLAPSE=$1
        shift
      else
        echo "readObjectProperties: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--parallel" ]; then
      if [ $# -ne 0 ]; then
        PARALLEL=$1
        shift
      else
        echo "readObjectProperties: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--convert-ddb" ]; then
      if [ $# -ne 0 ]; then
        PARALLEL=$1
        shift
      else
        echo "readObjectProperties: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--deaggregate" ]; then
      if [ $# -ne 0 ]; then
        PARALLEL=$1
        shift
      else
        echo "readObjectProperties: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--append-newlines" ]; then
      if [ $# -ne 0 ]; then
        APPEND_NEWLINES=$1
        shift
      else
        echo "readObjectProperties: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [[ "$CODE" =~ ^--.* ]]; then
      PASSTHROUGH+=($CODE)
      if [ $# -ne 0 ]; then
        PASSTHROUGH+=($1)
        shift
      else
        echo "readObjectProperties: You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    else
      PASSTHROUGH+=($CODE)
    fi
  done

  if [ ! -z "${ACTIVE}" ] && [ "${ACTIVE}" != "true" ] && [ "${ACTIVE}" != "false" ]; then
    echo "readObjectProperties: invalid boolean property --active $ACTIVE, must be one of (true, false)" 1>&2
    doHelp
    exit -1
  fi
  if [ ! -z "${COLLAPSE}" ] && [ "${COLLAPSE}" != "none" ] && [ "${COLLAPSE}" != "JSON" ] && [ "${COLLAPSE}" != "concat" ] && [ "${COLLAPSE}" != "concat-b64" ]; then
    echo "readObjectProperties: invalid property --collapse $COLLAPSE, must be one of (none, JSON, concat, concat-b64)" 1>&2
    doHelp
    exit -1
  fi
  if [ ! -z "${PARALLEL}" ] && [ "${PARALLEL}" != "true" ] && [ "${PARALLEL}" != "false" ]; then
    echo "readObjectProperties: invalid boolean property --parallel $PARALLEL, must be one of (true, false)" 1>&2
    doHelp
    exit -1
  fi
  if [ ! -z "${CONVERT_DDB}" ] && [ "${CONVERT_DDB}" != "true" ] && [ "${CONVERT_DDB}" != "false" ]; then
    echo "readObjectProperties: invalid boolean property --convert-ddb $CONVERT_DDB, must be one of (true, false)" 1>&2
    doHelp
    exit -1
  fi
  if [ ! -z "${DEAGGREGATE}" ] && [ "${DEAGGREGATE}" != "true" ] && [ "${DEAGGREGATE}" != "false" ]; then
    echo "readObjectProperties: invalid boolean property --deaggregate $PARALLEL, must be one of (true, false)" 1>&2
    doHelp
    exit -1
  fi
  if [ ! -z "${APPEND_NEWLINES}" ] && [ "${APPEND_NEWLINES}" != "true" ] && [ "${APPEND_NEWLINES}" != "false" ]; then
    echo "readObjectProperties: invalid boolean property --append-newlines $APPEND_NEWLINES, must be one of (true, false)" 1>&2
    doHelp
    exit -1
  fi
}

## Adds a property to the JSON object, either for creation or update of Amazon DynamoDB
function appendJsonProperty {
  if [ "$1" == "update" ]; then
    if [ -z "${OBJECT_DEFINITION}" ]; then
      OBJECT_DEFINITION="\":$2\": $3"
    else
      OBJECT_DEFINITION="${OBJECT_DEFINITION}, \":$2\": $3"
    fi

    if [ -z "${OBJECT_UPDATE}" ]; then
      OBJECT_UPDATE="set #$2 = :$2"
    else
      OBJECT_UPDATE="${OBJECT_UPDATE}, #$2 = :$2"
    fi

    if [ -z "${OBJECT_ALIAS}" ]; then
      OBJECT_ALIAS="\"#$2\": \"$2\""
    else
      OBJECT_ALIAS="${OBJECT_ALIAS}, \"#$2\": \"$2\""
    fi
  else
    if [ -z "${OBJECT_DEFINITION}" ]; then
      OBJECT_DEFINITION="\"$2\": $3"
    else
      OBJECT_DEFINITION="${OBJECT_DEFINITION}, \"$2\": $3"
    fi
  fi
}

## Builds the JSON object for storing in Amazon DynamoDB, for creation or update
function buildObject {
  if [ "$1" == "create" ]; then
    appendJsonProperty "$1" "sourceArn" "{\"S\":\"${SOURCE_ARN}\"}"
    appendJsonProperty "$1" "id" "{\"S\":\"${WORKER_ID}\"}"
    appendJsonProperty "$1" "type" "{\"S\":\"${WORKER_TYPE}\"}"
    appendJsonProperty "$1" "destination" "{\"S\":\"${DESTINATION_ID}\"}"

    if [ ! -z "${DESTINATION_ROLE_ARN}" ]; then
      appendJsonProperty "$1" "role" "{\"S\":\"${DESTINATION_ROLE_ARN}\"}"
      if [ ! -z "${EXTERNAL_ID}" ]; then
        appendJsonProperty "$1" "externalId" "{\"S\":\"${EXTERNAL_ID}\"}"
      fi
    fi
    if [ ! -z "${DESTINATION_REGION}" ]; then
      appendJsonProperty "$1" "region" "{\"S\":\"${DESTINATION_REGION}\"}"
    fi
  elif [ "$1" != "update" ]; then
    echo "buildObject: Invalid mode $1 for function buildObject, expected 'create' or 'update'" 1>&2
    exit
  fi
  if [ ! -z "${ACTIVE}" ]; then
    appendJsonProperty "$1" "active" "{\"BOOL\":${ACTIVE}}"
  fi
  if [ ! -z "${COLLAPSE}" ]; then
    appendJsonProperty "$1" "collapse" "{\"S\":\"${COLLAPSE}\"}"
  fi
  if [ ! -z "${PARALLEL}" ]; then
    appendJsonProperty "$1" "parallel" "{\"BOOL\":${PARALLEL}}"
  fi
  if [ ! -z "${CONVERT_DDB}" ]; then
    appendJsonProperty "$1" "convertDDB" "{\"BOOL\":${CONVERT_DDB}}"
  fi
  if [ ! -z "${DEAGGREGATE}" ]; then
    appendJsonProperty "$1" "deaggregate" "{\"BOOL\":${DEAGGREGATE}}"
  fi
  if [ ! -z "${APPEND_NEWLINES}" ]; then
    appendJsonProperty "$1" "appendNewlines" "{\"BOOL\":${APPEND_NEWLINES}}"
  fi
}

## Registers the function to the specified source
function hookFanoutSource {
  HOOK_ID=$(aws lambda "list-event-source-mappings" "--function-name" $FUNCTION_NAME "--event-source-arn" "$SOURCE_ARN" --query 'EventSourceMappings[0].UUID' --output text  ${CLI_PARAMS[@]} 2> /dev/null)

  if [ -z "${BATCH_SIZE}" ]; then
    BATCH_SIZE=100
  fi
  if [ -z "${STARTING_POSITION}" ]; then
    STARTING_POSITION=LATEST
  fi

  if [ ! -z "$HOOK_ID" ] && [ "$HOOK_ID" != "None" ]; then
    echo "There is already a hook (ID: $HOOK_ID) for this source"
  else
    aws lambda create-event-source-mapping --event-source-arn $SOURCE_ARN --function-name $FUNCTION_NAME --enabled --batch-size $BATCH_SIZE --starting-position $STARTING_POSITION ${CLI_PARAMS[@]}
  fi
}

## Unregisters the function from the specified hook
function unhookFanoutSource {
  HOOK_ID=$(aws lambda "list-event-source-mappings" "--function-name" $FUNCTION_NAME "--event-source-arn" "$SOURCE_ARN" --query 'EventSourceMappings[0].UUID' --output text  ${CLI_PARAMS[@]} 2> /dev/null)

  if [ -z "$HOOK_ID" ] || [ "$HOOK_ID" == "None" ]; then
    echo "There is no hook for this source"
  else
    aws lambda delete-event-source-mapping --uuid $HOOK_ID ${CLI_PARAMS[@]}
  fi
}

## Unregisters the function from the specified hook
function setHookFanoutSourceState {
  HOOK_ID=$(aws lambda "list-event-source-mappings" "--function-name" $FUNCTION_NAME "--event-source-arn" "$SOURCE_ARN" --query 'EventSourceMappings[0].UUID' --output text  ${CLI_PARAMS[@]} 2> /dev/null)

  local ENABLE_PARAM=
  if [ "$1" == "active" ]; then
    ENABLE_PARAM=--enabled
  else
    ENABLE_PARAM=--no-enabled
  fi

  if [ -z "$HOOK_ID" ] || [ "$HOOK_ID" == "None" ]; then
    echo "There is no hook for this source"
  else
    aws lambda update-event-source-mapping --uuid $HOOK_ID $ENABLE_PARAM ${CLI_PARAMS[@]}
  fi
}

## Adds a target (source, name, destination-id, region, role) to the list of targets of the fanout function
function registerFanoutTarget {
  if [ -z "${ACTIVE}" ]; then
    ACTIVE=false
  fi
  if [ -z "${COLLAPSE}" ]; then
    COLLAPSE=none
  fi

  buildObject create
  aws dynamodb put-item --table-name ${TABLE_NAME} --item "{${OBJECT_DEFINITION}}"  ${CLI_PARAMS[@]} > /dev/null
}

## Updates a named target to the list of targets of the fanout function for a specific source
function updateFanoutTarget {
  buildObject update
  aws dynamodb update-item --table-name ${TABLE_NAME} --key "{\"sourceArn\":{\"S\":\"${SOURCE_ARN}\"}, \"id\":{\"S\":\"${WORKER_ID}\"}}" --update-expression "${OBJECT_UPDATE}" --condition-expression "attribute_exists(id)" --expression-attribute-names "{${OBJECT_ALIAS}}" --expression-attribute-values "{${OBJECT_DEFINITION}}" ${CLI_PARAMS[@]} > /dev/null
}

## Removes a named target from the list of targets of the fanout function for a specific source
function unregisterFanoutTarget {
  aws dynamodb delete-item --table-name ${TABLE_NAME} --key "{\"sourceArn\":{\"S\":\"${SOURCE_ARN}\"}, \"id\":{\"S\":\"${WORKER_ID}\"}}" ${CLI_PARAMS[@]} > /dev/null
}

## Lists the targets from the list of targets of the fanout function for a specific source
function listFanoutTargets {
  aws dynamodb query --table-name ${TABLE_NAME} --key-condition-expression "sourceArn = :sourceArn" --expression-attribute-values "{\":sourceArn\":{\"S\":\"${SOURCE_ARN}\"}}" --query 'Items[*].{_1_id: id.S, _2_type: type.S, _3_destination: destination.S, _4_active: active.BOOL}' --output table ${CLI_PARAMS[@]}
}
