#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
// import { CdkStack } from '../lib/cdk-stack';
import { CdkStaticSiteStack } from '../lib/frontend-deploy-stack'

const app = new cdk.App();
new CdkStaticSiteStack(app, 'CdkStack', {
    env: {
        account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION,
    }
})
