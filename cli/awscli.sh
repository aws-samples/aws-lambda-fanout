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
# This script manages the parameters used by the AWS CLI
#

## Passes through all the parameters passed to the function and removes the parameters used for the aws cli
# All remaining parameters will be made available in the ${PASSTHROUGH[@]} array
function readCliParams {
  PASSTHROUGH=()
  CLI_PARAMS=()
  CLI_PARAMS_NO_REGION=()

  while [ $# -ne 0 ]; do
  	CODE=$1
    shift
    if [ "$CODE" == "--endpoint-url" ] || [ "$CODE" == "--profile" ]; then
      CLI_PARAMS+=($CODE)
      CLI_PARAMS_NO_REGION+=($CODE)
      if [ $# -ne 0 ]; then
        CLI_PARAMS+=($1)
        CLI_PARAMS_NO_REGION+=($1)
        shift
      else
        echo "You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--region" ]; then
      CLI_PARAMS+=($CODE)
      if [ $# -ne 0 ]; then
        CLI_PARAMS+=($1)
        shift
      else
        echo "You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    elif [ "$CODE" == "--debug" ] || [ "$CODE" == "--no-verify-ssl" ]; then
      CLI_PARAMS+=($CODE)
      CLI_PARAMS_NO_REGION+=($CODE)
    elif [[ "$CODE" =~ ^--.* ]]; then
      PASSTHROUGH+=($CODE)
      if [ $# -ne 0 ]; then
        PASSTHROUGH+=($1)
        shift
      else
        echo "You must specify a value for parameter $CODE" 1>&2
        doHelp
        exit -1
      fi
    else
      PASSTHROUGH+=($CODE)
    fi
  done
}

