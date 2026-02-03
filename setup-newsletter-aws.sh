#!/bin/bash

# ============================================
# Newsletter AWS Infrastructure Setup
# Creates: DynamoDB + Lambda + API Gateway + SES
# ============================================

set -e

REGION="eu-central-1"
TABLE_NAME="1copywriting-newsletter"
LAMBDA_NAME="1copywriting-newsletter"
API_NAME="1copywriting-newsletter-api"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "============================================"
echo "  Newsletter Infrastructure Setup"
echo "============================================"
echo ""

# ============================================
# 1. Create DynamoDB Table
# ============================================
echo "[1/5] Creating DynamoDB table..."

aws dynamodb create-table \
    --table-name $TABLE_NAME \
    --attribute-definitions AttributeName=email,AttributeType=S \
    --key-schema AttributeName=email,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION \
    2>/dev/null || echo "  Table already exists"

aws dynamodb wait table-exists --table-name $TABLE_NAME --region $REGION
echo "✓ DynamoDB table ready: $TABLE_NAME"

# ============================================
# 2. Create IAM Role for Lambda
# ============================================
echo ""
echo "[2/5] Creating IAM role..."

# Trust policy
cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
    --role-name ${LAMBDA_NAME}-role \
    --assume-role-policy-document file:///tmp/trust-policy.json \
    2>/dev/null || echo "  Role already exists"

# Permissions policy
cat > /tmp/lambda-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE_NAME}"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
EOF

aws iam put-role-policy \
    --role-name ${LAMBDA_NAME}-role \
    --policy-name ${LAMBDA_NAME}-policy \
    --policy-document file:///tmp/lambda-policy.json

echo "✓ IAM role ready: ${LAMBDA_NAME}-role"
echo "  Waiting 10s for role propagation..."
sleep 10

# ============================================
# 3. Create Lambda Function
# ============================================
echo ""
echo "[3/5] Creating Lambda function..."

# Package Lambda code
cd newsletter-lambda
zip -r ../newsletter-lambda.zip index.mjs
cd ..

# Create or update Lambda
if aws lambda get-function --function-name $LAMBDA_NAME --region $REGION 2>/dev/null; then
    aws lambda update-function-code \
        --function-name $LAMBDA_NAME \
        --zip-file fileb://newsletter-lambda.zip \
        --region $REGION
    echo "  Lambda function updated"
else
    aws lambda create-function \
        --function-name $LAMBDA_NAME \
        --runtime nodejs20.x \
        --handler index.handler \
        --role arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_NAME}-role \
        --zip-file fileb://newsletter-lambda.zip \
        --timeout 30 \
        --memory-size 256 \
        --region $REGION
fi

aws lambda wait function-active --function-name $LAMBDA_NAME --region $REGION
echo "✓ Lambda function ready: $LAMBDA_NAME"

# ============================================
# 4. Create API Gateway (HTTP API)
# ============================================
echo ""
echo "[4/5] Creating API Gateway..."

# Check if API exists
API_ID=$(aws apigatewayv2 get-apis --region $REGION \
    --query "Items[?Name=='${API_NAME}'].ApiId" --output text)

if [ -z "$API_ID" ]; then
    # Create HTTP API
    API_ID=$(aws apigatewayv2 create-api \
        --name $API_NAME \
        --protocol-type HTTP \
        --cors-configuration '{
          "AllowOrigins": ["https://www.1copywriting.pl"],
          "AllowMethods": ["POST", "GET", "OPTIONS"],
          "AllowHeaders": ["Content-Type"]
        }' \
        --region $REGION \
        --query 'ApiId' --output text)
    echo "  API created: $API_ID"
else
    echo "  API exists: $API_ID"
fi

# Create Lambda integration
INTEGRATION_ID=$(aws apigatewayv2 get-integrations --api-id $API_ID --region $REGION \
    --query 'Items[0].IntegrationId' --output text 2>/dev/null)

if [ "$INTEGRATION_ID" = "None" ] || [ -z "$INTEGRATION_ID" ]; then
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
        --api-id $API_ID \
        --integration-type AWS_PROXY \
        --integration-uri arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME} \
        --payload-format-version 2.0 \
        --region $REGION \
        --query 'IntegrationId' --output text)
fi

# Create routes
for ROUTE in "POST /subscribe" "GET /confirm" "GET /unsubscribe"; do
    aws apigatewayv2 create-route \
        --api-id $API_ID \
        --route-key "$ROUTE" \
        --target "integrations/${INTEGRATION_ID}" \
        --region $REGION 2>/dev/null || true
done

# Create stage
aws apigatewayv2 create-stage \
    --api-id $API_ID \
    --stage-name prod \
    --auto-deploy \
    --region $REGION 2>/dev/null || true

# Add Lambda permission for API Gateway
aws lambda add-permission \
    --function-name $LAMBDA_NAME \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
    --region $REGION 2>/dev/null || true

API_ENDPOINT="https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
echo "✓ API Gateway ready"

# ============================================
# 5. Configure SES
# ============================================
echo ""
echo "[5/5] Configuring SES..."

# Verify domain (will require DNS records)
aws ses verify-domain-identity \
    --domain 1copywriting.pl \
    --region $REGION 2>/dev/null || true

# Get DKIM tokens
DKIM_TOKENS=$(aws ses verify-domain-dkim \
    --domain 1copywriting.pl \
    --region $REGION \
    --query 'DkimTokens' --output text)

echo "✓ SES domain verification initiated"
echo ""
echo "============================================"
echo "  ✓ Setup Complete!"
echo "============================================"
echo ""
echo "API Endpoint: $API_ENDPOINT"
echo ""
echo "Endpoints:"
echo "  POST $API_ENDPOINT/subscribe"
echo "  GET  $API_ENDPOINT/confirm?email=...&token=..."
echo "  GET  $API_ENDPOINT/unsubscribe?email=...&token=..."
echo ""
echo "============================================"
echo "  IMPORTANT: Add DNS records for SES"
echo "============================================"
echo ""
echo "Add these CNAME records to Route 53 for DKIM:"
for TOKEN in $DKIM_TOKENS; do
    echo "  ${TOKEN}._domainkey.1copywriting.pl -> ${TOKEN}.dkim.amazonses.com"
done
echo ""
echo "Add this TXT record for SPF:"
echo "  1copywriting.pl -> \"v=spf1 include:amazonses.com ~all\""
echo ""
echo "Add this TXT record for domain verification (check SES console):"
echo "  _amazonses.1copywriting.pl -> (check AWS SES console for value)"
echo ""

# Save config
cat > newsletter-config.json << EOF
{
  "apiEndpoint": "${API_ENDPOINT}",
  "tableName": "${TABLE_NAME}",
  "lambdaName": "${LAMBDA_NAME}",
  "region": "${REGION}"
}
EOF

echo "Config saved to: newsletter-config.json"
