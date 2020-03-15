import * as cdk from '@aws-cdk/core'

import * as s3 from '@aws-cdk/aws-s3'
import * as iam from '@aws-cdk/aws-iam'
import * as s3Deploy from '@aws-cdk/aws-s3-deployment'
import * as cloudfront from '@aws-cdk/aws-cloudfront'
// import { SPADeploy } from 'cdk-spa-deploy'
import * as ssm from '@aws-cdk/aws-ssm'
import * as certManager from '@aws-cdk/aws-certificatemanager'
import * as route53 from '@aws-cdk/aws-route53'
import * as route53Targets from '@aws-cdk/aws-route53-targets'
// https://qiita.com/shootacean/items/6042afb6b1280bafae9e
// https://docs.aws.amazon.com/cdk/api/latest/docs/aws-certificatemanager-readme.html
// https://rubenjgarcia.es/static-web-in-cloudfront-with-aws-cdk/

type Stage = 'prod' | 'stg' | 'dev'

export class CdkStaticSiteStack extends cdk.Stack {

  // readonly AppDomain: string = 'example.com'
  readonly AppName: string = 'WebPrint'
  readonly Stage: Stage = 'stg'
  readonly PascalStage: string = `${this.Stage.charAt(0).toUpperCase()}${this.Stage.slice(1)}`

  // Route53に登録されているドメイン
  readonly BaseDomain: string = `awspractice.satackey.com`

  // サイトをデプロイするドメイン prodの時はBaseDomainで、それ以外はStage.Basedomain
  readonly PublicDomain: string = this.Stage === 'prod' ? this.BaseDomain : `${this.Stage}.${this.BaseDomain}`

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: `${this.BaseDomain}.`,
      privateZone: false,
    })

    const cert = new certManager.DnsValidatedCertificate(this, `${this.PascalStage}Certificate`, {
      domainName: this.PublicDomain,
      subjectAlternativeNames: [`*.${this.PublicDomain}`],
      hostedZone,
      region: `us-east-1`,
    })

    // s3バケットを作成
    const spaBucket = new s3.Bucket(this, `SpaBucket`, {
      bucketName: `${this.AppName.toLowerCase()}-${this.account}-${this.Stage}`,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // new SPADeploy(this, `CreateSpaBucket`).createBasicSite({
    //   indexDoc: 'index.html',
    //   websiteFolder: '../frontend/build'
    // })

    // s3バケットへアップロード
    new s3Deploy.BucketDeployment(this, 'DeploySpa', {
      sources: [s3Deploy.Source.asset('../frontend/build')],
      destinationBucket: spaBucket,
    })

    // const oai = new cloudfront.CfnCloudFrontOriginAccessIdentity(this, this.prefix() + '-oai', {
    //   cloudFrontOriginAccessIdentityConfig: {
    //     comment: 's3 access.',
    //   }
    // });

    const oai = new cloudfront.OriginAccessIdentity(this, `CfOai`, {
      comment: 's3 access.',
    })

    const policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject'],
      principals: [new iam.CanonicalUserPrincipal(oai.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
      resources: [
        `${spaBucket.bucketArn}/*`
      ]
    })
    spaBucket.addToResourcePolicy(policy)

    // CloudFrontディストリビューションを作成する
    const distribution = new cloudfront.CloudFrontWebDistribution(this, `createCfDist`, {
      defaultRootObject: 'index.html',
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: spaBucket,
            originAccessIdentity: oai
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              compress: true,
              minTtl: cdk.Duration.seconds(0),
              maxTtl: cdk.Duration.days(365),
              defaultTtl: cdk.Duration.days(1),
            }
          ]
        }
      ],
      // 独自ドメインを設定する場合に使用する
      viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(cert, {
        aliases: [this.PublicDomain],
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1,
        sslMethod: cloudfront.SSLMethod.SNI,
      }),
      errorConfigurations: [
        {
          errorCode: 403,
          errorCachingMinTtl: 300,
          responseCode: 200,
          responsePagePath: '/index.html'
        }
      ]
    });

    new route53.ARecord(this, `spaPublicDomainARecord`, {
      recordName: this.PublicDomain,
      target: route53.AddressRecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
      zone: hostedZone,
    })

    new route53.AaaaRecord(this, `spaPublicDomainAaaaRecord`, {
      recordName: this.PublicDomain,
      target: route53.AddressRecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
      zone: hostedZone,
    })

    cdk.Tag.add(this, 'App', this.AppName);
    cdk.Tag.add(this, 'Stage', this.Stage);

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.domainName}`,
    })
    new cdk.CfnOutput(this, 'CloudFrontDistributionID', {
      value: distribution.distributionId,
    })

  }

  private prefix(): string {
    return this.AppName.toLowerCase() + '-' + this.Stage.toLowerCase();
  }


}
