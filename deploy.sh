#!/bin/bash

# ============================================
# 1copywriting.pl - Deploy Script
# AWS S3 + CloudFront deployment
# ============================================

set -e

# Configuration
S3_BUCKET="www.1copywriting.pl"
CLOUDFRONT_WWW_ID="E1BD994ZWOP8XT"
CLOUDFRONT_REDIRECT_ID="EDZTOI72QDPK7"
DIST_DIR="dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  1copywriting.pl - Deploy Script${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if dist directory exists
if [ ! -d "$DIST_DIR" ]; then
    echo -e "${YELLOW}⚠ Dist directory not found. Running build...${NC}"
    npm run build
fi

# Confirm deployment
echo -e "${YELLOW}This will deploy to:${NC}"
echo -e "  S3 Bucket: ${GREEN}$S3_BUCKET${NC}"
echo -e "  CloudFront: ${GREEN}$CLOUDFRONT_WWW_ID${NC}"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# Step 1: Build
echo ""
echo -e "${BLUE}[1/4] Building project...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"

# Step 2: Sync to S3
echo ""
echo -e "${BLUE}[2/4] Syncing to S3...${NC}"
aws s3 sync $DIST_DIR/ s3://$S3_BUCKET/ \
    --delete \
    --cache-control "public, max-age=31536000" \
    --exclude "*.html" \
    --exclude "*.xml" \
    --exclude "*.json"

# HTML files with shorter cache
aws s3 sync $DIST_DIR/ s3://$S3_BUCKET/ \
    --delete \
    --cache-control "public, max-age=0, must-revalidate" \
    --exclude "*" \
    --include "*.html" \
    --include "*.xml" \
    --include "*.json"

echo -e "${GREEN}✓ S3 sync complete${NC}"

# Step 3: Invalidate CloudFront cache
echo ""
echo -e "${BLUE}[3/4] Invalidating CloudFront cache (www)...${NC}"
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_WWW_ID \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text)
echo -e "${GREEN}✓ Invalidation created: $INVALIDATION_ID${NC}"

# Step 4: Wait for invalidation (optional)
echo ""
echo -e "${BLUE}[4/4] Waiting for invalidation to complete...${NC}"
aws cloudfront wait invalidation-completed \
    --distribution-id $CLOUDFRONT_WWW_ID \
    --id $INVALIDATION_ID
echo -e "${GREEN}✓ Invalidation complete${NC}"

# Done
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✓ Deployment successful!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  Website: ${BLUE}https://www.1copywriting.pl${NC}"
echo -e "  S3:      ${BLUE}s3://$S3_BUCKET${NC}"
echo ""