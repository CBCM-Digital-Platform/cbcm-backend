# Hierarchical Resource Management System - Implementation Notes

## Overview
This document describes the implementation of the hierarchical learning resource management system for CBCM, which implements a Super Admin → Facility → Mentor → Mentee permission chain for PDF, audio, and video resources.

## Architecture

### New Models (Separate from Existing Module-Based Resources)
The implementation creates NEW models distinct from the existing module-based `Resource` model to preserve existing functionality:

1. **HierarchicalResource** - Core resource entity
   - Fields: id, title, description, type (pdf/audio/video), uploaded_file_id, original_filename, verified_mime_type, file_size_bytes, upload_status, publication_status, created_by, updated_by, archived_at, archived_by
   - Relationships: belongsTo UploadedFile, User (created_by, updated_by, archived_by)

2. **FacilityResourceGrant** - Super Admin → Facility grants
   - Fields: id, resource_id, facility_id, granted_by, grant_status (active/revoked), granted_at, revoked_at, revoked_by
   - Unique constraint: (resource_id, facility_id) where grant_status='active'
   - Cascade delete on resource or facility

3. **MentorResourceGrant** - Facility Admin → Mentor grants
   - Fields: id, resource_id, facility_id, mentor_id, granted_by, grant_status (active/revoked), granted_at, revoked_at, revoked_by
   - Unique constraint: (resource_id, mentor_id) where grant_status='active'
   - Cascade delete on resource, facility, or mentor

4. **MenteeResourceAssignment** - Mentor → Mentee assignments
   - Fields: id, resource_id, mentor_id, mentee_id, facility_id, assignment_status (active/revoked), assigned_by, assigned_at, revoked_at, revoked_by, learning_note
   - Unique constraint: (resource_id, mentee_id) where assignment_status='active'
   - Cascade delete on resource, mentor, or mentee

### Access Hierarchy
System Resource → Active Facility Grant → Active Mentor Grant → Active Mentee Assignment

- Upstream revocation invalidates downstream access immediately
- Revoked grants/assignments preserve history (status='revoked')
- Physical file deletion is separate from access revocation

## Database Migration

### Migration File
`src/database/migrations/20261027000000-create-hierarchical-resource-tables.js`

### Run Migration
```bash
npm run migrate
```

### Rollback (if needed)
```bash
npm run migrate:undo
```

## API Endpoints

Base path: `/api/v1/hierarchical-resources`

### Super Admin Only
- `POST /` - Upload resource (multipart/form-data)
- `POST /:id/grant-facility` - Grant to facilities
- `DELETE /:id/facilities/:facilityId` - Revoke from facility

### Facility Admin Only
- `POST /:id/grant-mentor` - Grant to mentors in their facility
- `DELETE /:id/mentors/:mentorId` - Revoke from mentor

### Mentor Only
- `POST /:id/assign-mentee` - Assign to their mentees
- `DELETE /:id/mentees/:menteeId` - Revoke from mentee

### All Authenticated Users (Scoped)
- `GET /` - List resources (scoped by role and grants)
- `GET /:id` - Get resource details
- `GET /:id/content` - Download/stream file content

## Authorization Rules

### Super Admin
- Can create, view, and manage all resources
- Can grant resources to any facility
- Can revoke facility access (cascades to mentors/mentees)
- Can view all access hierarchy

### Facility Admin
- Can list resources granted to their facility
- Can grant resources to mentors in their facility
- Can revoke mentor access (cascades to mentees)
- Cannot grant resources outside their facility scope
- Cannot modify global resource metadata

### Mentor
- Can list resources granted to them
- Can view/download their authorized resources
- Can assign resources to their assigned mentees
- Cannot grant to other mentors' mentees
- Cannot bypass facility or Super Admin restrictions

### Mentee
- Can list resources assigned to them
- Can view/download their assigned resources
- Cannot list global resource library
- Cannot self-assign resources

## Storage

### S3 Integration
- Uses existing S3 provider (`src/providers/s3-storage.provider.js`)
- Private bucket with no public URLs
- Short-lived presigned URLs generated after access verification
- File metadata stored in PostgreSQL via UploadedFile model

### File Validation
- MIME type validation: PDF, audio (MP3, WAV, WebM), video (MP4, WebM, MOV)
- File signature verification (magic bytes)
- Size limit: 50MB (configurable via UPLOAD_MAX_BYTES)
- Rejected formats: executables, scripts, documents

## Revocation Behavior

### Facility Grant Revocation
- Prevents new access by facility and all downstream users
- Invalidates all mentor grants and mentee assignments
- Preserves historical records (status='revoked')
- Does NOT delete the physical file

### Mentor Grant Revocation
- Prevents mentor from accessing resource
- Prevents downstream mentee access
- Preserves assignment history

### Mentee Assignment Revocation
- Prevents mentee from accessing resource
- Preserves assignment history

### Physical File Deletion
- Only authorized users (resource creators or Super Admins) can delete files
- Checks for shared file references before deletion
- Handles S3 failures gracefully
- Retains metadata for retry/reconciliation

## Testing

### Test File
`tests/unit/hierarchical-resources.test.js`

### Run Tests
```bash
npm run test:hierarchical-resources
```

### Test Coverage
- Super Admin resource creation
- Facility grant workflow
- Mentor grant workflow
- Mentee assignment workflow
- Access control and scoping
- Revocation cascading
- Listing and pagination

## Configuration

### Environment Variables
- `STORAGE_PROVIDER` - 'local' or 's3'
- `S3_BUCKET` - S3 bucket name
- `S3_REGION` - AWS region
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `S3_KEY_PREFIX` - Optional prefix for S3 keys
- `UPLOAD_MAX_BYTES` - Max file size in bytes

### Deployment Steps
1. Run database migration: `npm run migrate`
2. Configure S3 credentials in environment
3. Set STORAGE_PROVIDER=s3
4. Ensure IAM permissions: s3:PutObject, s3:GetObject, s3:DeleteObject
5. Deploy with existing build command

## IAM Permissions Required (for S3)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

## Swagger Documentation
Updated in `src/docs/openapi.yaml` with:
- New tag: "Hierarchical Resources"
- Schemas: HierarchicalResource, HierarchicalResourceListResponse
- All endpoint paths and operations documented
- Authorization requirements specified per endpoint
- Multipart upload format specified

## Security Considerations
- No permanent public S3 URLs exposed
- Server-side access verification before each file operation
- Role and relationship-based authorization enforced in services
- Prevents IDOR vulnerabilities through scoped queries
- File signature validation prevents malicious uploads
- Storage keys never exposed to unauthorized clients
- Cascade revocation prevents privilege escalation

## Files Changed
1. `src/models/hierarchical-resource.model.js` - NEW
2. `src/models/facility-resource-grant.model.js` - NEW
3. `src/models/mentor-resource-grant.model.js` - NEW
4. `src/models/mentee-resource-assignment.model.js` - NEW
5. `src/models/index.js` - Updated to include new models
6. `src/database/migrations/20261027000000-create-hierarchical-resource-tables.js` - NEW
7. `src/services/hierarchical-resources.service.js` - NEW
8. `src/repositories/hierarchical-resources.repository.js` - NEW
9. `src/controllers/hierarchical-resources.controller.js` - NEW
10. `src/routes/hierarchical-resources.routes.js` - NEW
11. `src/routes/index.js` - Updated to register new routes
12. `src/docs/openapi.yaml` - Updated with new endpoints and schemas
13. `tests/unit/hierarchical-resources.test.js` - NEW
14. `package.json` - Added test script
15. `.env.example` - Updated with S3 configuration

## Backward Compatibility
- Existing module-based Resource model and routes unchanged
- Existing file upload infrastructure reused
- Existing S3 provider reused
- No changes to existing API contracts
- Migration is additive (no destructive changes)
