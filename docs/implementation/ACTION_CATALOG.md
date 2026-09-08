# FLOW OS — Action Catalog
**Milestone:** Phase 2 Implementation Specification  
**Status:** Approved for Core Integration  
**Layer:** Master Capability Inventory  

---

## Executive Summary

The FLOW OS Action Catalog is the master directory of all executable capabilities available within the platform. Every connector is categorized into distinct actions with defined parameters, validation rules, risk profiles, governance defaults, and rollback strategies.

This catalog serves as the absolute authority for:
1. **The Cognitive Router Agent:** Determining which executable endpoints can fulfill user intent.
2. **The Governance Engine:** Checking security policies and verifying manual or multi-person approval gates.
3. **The Audit Logger:** Recording dynamic outcomes and tracking historical changes.

---

## Catalog Index by Connector

1. [GitHub Actions](#1-github-actions) (17 actions)
2. [Slack Actions](#2-slack-actions) (17 actions)
3. [Gmail Actions](#3-gmail-actions) (17 actions)
4. [Jira Actions](#4-jira-actions) (17 actions)
5. [Google Calendar Actions](#5-google-calendar-actions) (17 actions)
6. [Confluence Actions](#6-confluence-actions) (17 actions)
7. [Google Docs Actions](#7-google-docs-actions) (17 actions)
8. [Google Drive Actions](#8-google-drive-actions) (17 actions)
9. [Salesforce Actions](#9-salesforce-actions) (17 actions)
10. [HubSpot Actions](#10-hubspot-actions) (17 actions)
11. [AWS Infrastructure Actions](#11-aws-infrastructure-actions) (17 actions)
12. [Azure Cloud Actions](#12-azure-cloud-actions) (17 actions)
13. [Datadog Observability Actions](#13-datadog-observability-actions) (17 actions)
14. [PagerDuty Incident Actions](#14-pagerduty-incident-actions) (17 actions)
15. [Kubernetes Actions](#15-kubernetes-actions) (17 actions)
16. [Docker Engine Actions](#16-docker-engine-actions) (17 actions)
17. [Redis In-Memory Actions](#17-redis-in-memory-actions) (17 actions)
18. [PostgreSQL Database Actions](#18-postgresql-database-actions) (17 actions)

---

## 1. GitHub Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `GH_READ_PR` | Read PR | Fetch pull request metadata, commits, and diff files. | LOW | No | Read | No | Prod | `owner`, `repo`, `prNumber` | PR details JSON | 300ms | Manual, Auto |
| `GH_APPROVE_PR` | Approve PR | Submit an approval review on an active PR. | MEDIUM | No | Write | Yes | Prod | `owner`, `repo`, `prNumber`, `body` | Review details JSON | 400ms | Manual, Auto |
| `GH_MERGE_PR` | Merge PR | Merge a pull request using merge, squash, or rebase. | HIGH | Yes | Write | No | Prod | `owner`, `repo`, `prNumber`, `method` | Commit SHA JSON | 1.2s | Auto, Incident |
| `GH_CREATE_BRANCH` | Create Branch | Create a new Git branch from a target SHA or reference. | LOW | No | Write | Yes | Prod | `owner`, `repo`, `branchName`, `source` | Ref details JSON | 250ms | Manual, Auto |
| `GH_CREATE_PR` | Create PR | Create a new pull request against a base branch. | MEDIUM | No | Write | Yes | Prod | `owner`, `repo`, `title`, `head`, `base`, `body` | PR details JSON | 500ms | Manual, Auto |
| `GH_CLOSE_PR` | Close PR | Close a pull request without merging it. | MEDIUM | No | Write | Yes | Prod | `owner`, `repo`, `prNumber` | Closed PR JSON | 400ms | Manual, Auto |
| `GH_ADD_COMMENT` | Add PR Comment | Post a comment on a pull request or issue. | LOW | No | Write | Yes | Prod | `owner`, `repo`, `prNumber`, `body` | Comment details JSON | 300ms | Manual, Auto |
| `GH_REQ_REVIEW` | Request Reviewers | Add reviewers to an active pull request. | LOW | No | Write | Yes | Prod | `owner`, `repo`, `prNumber`, `reviewers` | PR details JSON | 350ms | Manual, Auto |
| `GH_ASSIGN_ISSUE`| Assign Issue | Set assignees on an issue. | LOW | No | Write | Yes | Prod | `owner`, `repo`, `issueId`, `assignees` | Issue details JSON | 200ms | Manual, Auto |
| `GH_CREATE_ISSUE`| Create Issue | Create a new repository issue. | LOW | No | Write | Yes | Prod | `owner`, `repo`, `title`, `body`, `labels` | Issue details JSON | 400ms | Manual, Auto |
| `GH_LABEL_ISSUE` | Label Issue | Add tag labels to an issue or pull request. | LOW | No | Write | Yes | Prod | `owner`, `repo`, `issueId`, `labels` | Label list JSON | 200ms | Manual, Auto |
| `GH_CREATE_REL` | Create Release | Publish a repository release with a Git tag and changelog. | HIGH | Yes | Write | Yes | Prod | `owner`, `repo`, `tagName`, `name`, `body` | Release JSON | 900ms | Manual, Auto |
| `GH_DEL_BRANCH` | Delete Branch | Delete a remote Git branch. | HIGH | Yes | Write | No | Prod | `owner`, `repo`, `branchName` | Success indicator JSON | 400ms | Manual, Auto |
| `GH_COMPARE` | Compare Refs | Compare commits and diff files between two branches/SHAs. | LOW | No | Read | No | Prod | `owner`, `repo`, `base`, `head` | Comparison JSON | 500ms | Manual, Auto |
| `GH_LIST_COMMITS`| List Commits | Fetch commit history for a repository or branch. | LOW | No | Read | No | Prod | `owner`, `repo`, `branch`, `limit` | Commit array JSON | 400ms | Manual, Auto |
| `GH_RUN_WORKFLOW`| Run Workflow | Trigger a GitHub Actions workflow run. | HIGH | Yes | Write | No | Prod | `owner`, `repo`, `workflowId`, `ref`, `inputs` | Run ID JSON | 600ms | Manual, Auto |
| `GH_STOP_WORK` | Cancel Workflow | Cancel an active GitHub Actions workflow run. | MEDIUM | No | Write | No | Prod | `owner`, `repo`, `runId` | Success indicator JSON | 350ms | Manual, Auto |

---

## 2. Slack Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `SL_SEND_MSG` | Send Message | Post a message to a public/private channel or user. | LOW | No | Write | Yes | Prod | `channelId`, `text` | Message ts JSON | 200ms | Manual, Auto |
| `SL_REPLY_THREAD`| Reply Thread | Post a reply to an active message thread. | LOW | No | Write | Yes | Prod | `channelId`, `threadTs`, `text` | Message ts JSON | 200ms | Manual, Auto |
| `SL_CREATE_CHAN` | Create Channel | Create a new Slack channel. | MEDIUM | No | Write | Yes | Prod | `channelName`, `isPrivate` | Channel info JSON | 400ms | Manual, Auto |
| `SL_ARCHIVE_CH` | Archive Channel | Archive an active Slack channel. | HIGH | Yes | Write | Yes | Prod | `channelId` | Success JSON | 500ms | Manual, Auto |
| `SL_INVITE_USR` | Invite User | Add users to a channel. | LOW | No | Write | Yes | Prod | `channelId`, `userIds` | Channel info JSON | 300ms | Manual, Auto |
| `SL_KICK_USER` | Kick User | Remove a user from a channel. | HIGH | Yes | Write | Yes | Prod | `channelId`, `userId` | Success JSON | 350ms | Manual, Auto |
| `SL_SET_TOPIC` | Set Topic | Update a channel's topic or purpose text. | LOW | No | Write | Yes | Prod | `channelId`, `topic` | Channel topic JSON | 250ms | Manual, Auto |
| `SL_ADD_REACT` | Add Reaction | Add an emoji reaction to a message. | LOW | No | Write | Yes | Prod | `channelId`, `timestamp`, `emoji` | Success JSON | 150ms | Manual, Auto |
| `SL_DEL_REACT` | Remove Reaction | Remove an emoji reaction from a message. | LOW | No | Write | Yes | Prod | `channelId`, `timestamp`, `emoji` | Success JSON | 150ms | Manual, Auto |
| `SL_PIN_MSG` | Pin Message | Pin a message in a channel. | LOW | No | Write | Yes | Prod | `channelId`, `timestamp` | Success JSON | 200ms | Manual, Auto |
| `SL_DEL_MSG` | Delete Message | Delete a previously sent message. | MEDIUM | No | Write | No | Prod | `channelId`, `timestamp` | Success JSON | 200ms | Manual, Auto |
| `SL_UPDATE_MSG` | Update Message | Update the text content of a sent message. | LOW | No | Write | Yes | Prod | `channelId`, `timestamp`, `newText` | Success JSON | 200ms | Manual, Auto |
| `SL_USER_INFO` | Get User Info | Fetch profile details for a user. | LOW | No | Read | No | Prod | `userId` | Profile JSON | 150ms | Manual, Auto |
| `SL_SET_STATUS` | Set Status | Update status text and emoji. | LOW | No | Write | Yes | Prod | `statusText`, `statusEmoji`, `expiration` | Success JSON | 250ms | Manual, Auto |
| `SL_SEND_EPHEM` | Post Ephemeral | Post a message visible only to a specific user. | LOW | No | Write | No | Prod | `channelId`, `userId`, `text` | Success JSON | 200ms | Manual, Auto |
| `SL_RUN_SLASH` | Slash Command | Trigger a custom workspace slash command. | MEDIUM | No | Write | No | Prod | `command`, `text`, `channelId` | Command response JSON | 600ms | Manual, Auto |
| `SL_SEND_FILE` | Send File | Upload and share a file in a channel. | MEDIUM | No | Write | Yes | Prod | `channelId`, `fileContent`, `filename`, `title` | File info JSON | 1.1s | Manual, Auto |

---

## 3. Gmail Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `GM_SEND_EMAIL` | Send Email | Construct and send a new email. | MEDIUM | No | Write | No | Prod | `to`, `subject`, `body` | Message details JSON | 800ms | Manual, Auto |
| `GM_REPLY_EMAIL`| Reply Email | Send a reply within an existing thread. | LOW | No | Write | No | Prod | `threadId`, `body` | Message details JSON | 800ms | Manual, Auto |
| `GM_FWD_EMAIL` | Forward Email | Forward an email thread to new recipients. | MEDIUM | No | Write | No | Prod | `messageId`, `to`, `body` | Message details JSON | 900ms | Manual, Auto |
| `GM_CREATE_DRF` | Create Draft | Create a new draft message. | LOW | No | Write | Yes | Prod | `to`, `subject`, `body`, `threadId` | Draft details JSON | 400ms | Manual, Auto |
| `GM_UPDATE_DRF` | Update Draft | Update text, subjects, or recipients on a draft. | LOW | No | Write | Yes | Prod | `draftId`, `to`, `subject`, `body` | Draft details JSON | 450ms | Manual, Auto |
| `GM_SEND_DRAFT` | Send Draft | Dispatch an existing draft. | MEDIUM | No | Write | No | Prod | `draftId` | Message details JSON | 700ms | Manual, Auto |
| `GM_ARCHIVE` | Archive Thread | Remove Inbox labels from a thread. | LOW | No | Write | Yes | Prod | `threadId` | Thread details JSON | 300ms | Manual, Auto |
| `GM_TRASH_MSG` | Trash Message | Move a message to the trash folder. | MEDIUM | No | Write | Yes | Prod | `messageId` | Success JSON | 350ms | Manual, Auto |
| `GM_ADD_LABEL` | Label Thread | Apply a custom label to a thread. | LOW | No | Write | Yes | Prod | `threadId`, `labelId` | Thread details JSON | 300ms | Manual, Auto |
| `GM_REM_LABEL` | Unlabel Thread | Remove a label from a thread. | LOW | No | Write | Yes | Prod | `threadId`, `labelId` | Thread details JSON | 300ms | Manual, Auto |
| `GM_MARK_READ` | Mark Read | Remove UNREAD label from a thread. | LOW | No | Write | Yes | Prod | `threadId` | Success JSON | 250ms | Manual, Auto |
| `GM_MARK_UNRD` | Mark Unread | Apply UNREAD label to a thread. | LOW | No | Write | Yes | Prod | `threadId` | Success JSON | 250ms | Manual, Auto |
| `GM_SEARCH` | Search Messages | Query threads using Gmail query syntax. | LOW | No | Read | No | Prod | `query`, `limit` | Thread list JSON | 500ms | Manual, Auto |
| `GM_IMPORT_TH` | Import Thread | Fetch and index an entire thread into vector database. | LOW | No | Read | No | Prod | `threadId` | Ingestion status JSON | 1.5s | Manual, Auto |
| `GM_SET_VAC` | Set Out-of-Office| Configure vacation auto-responder parameters. | MEDIUM | No | Write | Yes | Prod | `enabled`, `subject`, `body`, `endDate` | Responder status JSON| 600ms | Manual, Auto |
| `GM_BLOCK` | Block Sender | Create filter to auto-trash emails from sender. | MEDIUM | No | Write | Yes | Prod | `email` | Filter details JSON | 400ms | Manual, Auto |
| `GM_CREATE_FLT` | Create Filter | Establish incoming email routing rules. | MEDIUM | No | Write | Yes | Prod | `criteria`, `action` | Filter details JSON | 500ms | Manual, Auto |

---

## 4. Jira Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `JR_CREATE_IS` | Create Issue | Create a new issue (story, task, bug). | LOW | No | Write | Yes | Prod | `projectKey`, `summary`, `type`, `desc` | Issue details JSON | 600ms | Manual, Auto |
| `JR_TRANSITION` | Transition Issue | Move issue status (e.g., In Progress, Done). | LOW | No | Write | Yes | Prod | `issueKey`, `transitionId` | Success JSON | 400ms | Manual, Auto |
| `JR_ASSIGN` | Assign Issue | Update assignee parameters on an issue. | LOW | No | Write | Yes | Prod | `issueKey`, `accountId` | Success JSON | 300ms | Manual, Auto |
| `JR_ADD_COMMENT` | Comment Issue | Post comment update on an issue. | LOW | No | Write | Yes | Prod | `issueKey`, `body` | Comment details JSON | 350ms | Manual, Auto |
| `JR_UPDATE_DSC` | Update Desc | Update summary, description or epic links. | LOW | No | Write | Yes | Prod | `issueKey`, `description` | Success JSON | 400ms | Manual, Auto |
| `JR_ATTACH` | Add Attachment | Upload attachment files to an issue. | MEDIUM | No | Write | Yes | Prod | `issueKey`, `fileContent`, `filename` | Attachment meta JSON | 1.2s | Manual, Auto |
| `JR_LINK_ISSUE` | Link Issues | Establish dependency links between two issues. | LOW | No | Write | Yes | Prod | `inwardKey`, `outwardKey`, `linkType` | Success JSON | 350ms | Manual, Auto |
| `JR_LOG_WORK` | Log Work | Add time-tracking log entries to an issue. | LOW | No | Write | Yes | Prod | `issueKey`, `timeSpent`, `started` | Worklog details JSON | 450ms | Manual, Auto |
| `JR_CREATE_COMP` | Create Component| Add new category component filters to a project. | LOW | No | Write | Yes | Prod | `projectKey`, `name`, `leadAccountId` | Component details JSON| 400ms | Manual, Auto |
| `JR_CREATE_VER` | Create Version | Establish a release version milestone. | MEDIUM | No | Write | Yes | Prod | `projectId`, `name`, `releaseDate` | Version details JSON | 500ms | Manual, Auto |
| `JR_ADD_WATCH` | Add Watcher | Add watchers to an issue thread. | LOW | No | Write | Yes | Prod | `issueKey`, `accountId` | Success JSON | 300ms | Manual, Auto |
| `JR_DEL_COMMENT` | Delete Comment | Remove a comment from an issue thread. | MEDIUM | No | Write | No | Prod | `issueKey`, `commentId` | Success JSON | 350ms | Manual, Auto |
| `JR_CREATE_SUB` | Create Subtask | Spawn a nested subtask under a parent issue. | LOW | No | Write | Yes | Prod | `parentKey`, `summary`, `description` | Issue details JSON | 550ms | Manual, Auto |
| `JR_JQL_SEARCH` | Search JQL | Retrieve issues matching JQL search criteria. | LOW | No | Read | No | Prod | `jql`, `limit` | Issue array JSON | 600ms | Manual, Auto |
| `JR_GET_SPRINT` | Get Sprint Info | Retrieve metadata and issues for active sprint. | LOW | No | Read | No | Prod | `boardId` | Sprint details JSON | 400ms | Manual, Auto |
| `JR_SET_PRIO` | Set Priority | Update importance level values. | LOW | No | Write | Yes | Prod | `issueKey`, `priorityId` | Success JSON | 300ms | Manual, Auto |
| `JR_ADD_LABEL` | Add Label | Apply tags to categorize issues. | LOW | No | Write | Yes | Prod | `issueKey`, `labels` | Label list JSON | 250ms | Manual, Auto |

---

## 5. Google Calendar Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `CAL_CREATE_EV` | Create Event | Schedule a calendar event with invitees. | LOW | No | Write | Yes | Prod | `summary`, `start`, `end`, `attendees` | Event details JSON | 500ms | Manual, Auto |
| `CAL_UPDATE_EV` | Update Event | Adjust title, description, timings, or location. | LOW | No | Write | Yes | Prod | `eventId`, `updates` | Event details JSON | 450ms | Manual, Auto |
| `CAL_DELETE_EV` | Delete Event | Cancel and delete an event. | MEDIUM | No | Write | Yes | Prod | `eventId` | Success JSON | 400ms | Manual, Auto |
| `CAL_ADD_ATT` | Add Attendee | Invite a new user to an event. | LOW | No | Write | Yes | Prod | `eventId`, `email` | Event details JSON | 350ms | Manual, Auto |
| `CAL_REM_ATT` | Remove Attendee | Remove an invitee from an event. | LOW | No | Write | Yes | Prod | `eventId`, `email` | Event details JSON | 350ms | Manual, Auto |
| `CAL_LIST_UP` | List Upcoming | Fetch upcoming events for a time window. | LOW | No | Read | No | Prod | `days`, `limit` | Event array JSON | 400ms | Manual, Auto |
| `CAL_SEARCH` | Search Events | Run text search queries across calendars. | LOW | No | Read | No | Prod | `query`, `limit` | Event array JSON | 450ms | Manual, Auto |
| `CAL_ADD_NOTES` | Add Notes | Save text descriptions inside custom properties. | LOW | No | Write | Yes | Prod | `eventId`, `notes` | Event details JSON | 300ms | Manual, Auto |
| `CAL_ADD_ACTS` | Add Actions | Save task updates in custom private properties. | LOW | No | Write | Yes | Prod | `eventId`, `actions` | Event details JSON | 300ms | Manual, Auto |
| `CAL_ADD_SUM` | Add Summary | Store AI meeting summary parameters in event. | LOW | No | Write | Yes | Prod | `eventId`, `summary` | Event details JSON | 300ms | Manual, Auto |
| `CAL_QUICK_MTG` | Quick Meeting | Spin up instant Google Meet conference links. | LOW | No | Write | Yes | Prod | `title`, `duration` | Meet URL JSON | 600ms | Manual, Auto |
| `CAL_SET_ROOM` | Set Room | Book a physical conference room resource. | LOW | No | Write | Yes | Prod | `eventId`, `roomEmail` | Event details JSON | 400ms | Manual, Auto |
| `CAL_SET_BUSY` | Set Busy Status | Block out focus time on the calendar. | LOW | No | Write | Yes | Prod | `start`, `end`, `title` | Event details JSON | 400ms | Manual, Auto |
| `CAL_DECLINE` | Decline Invites | Auto-decline conflicting event requests. | LOW | No | Write | Yes | Prod | `startTime`, `endTime` | Action status JSON | 500ms | Manual, Auto |
| `CAL_CREATE_OOO`| Out of Office | Schedule OOO blocks that decline new invites. | MEDIUM | No | Write | Yes | Prod | `start`, `end`, `declineMessage` | Event details JSON | 600ms | Manual, Auto |
| `CAL_PROP_TIME` | Propose Time | Send a time change request proposal to host. | LOW | No | Write | No | Prod | `eventId`, `newStart`, `newEnd` | Success JSON | 450ms | Manual, Auto |
| `CAL_SYNC` | Sync Calendar | Run sync operations to update graph databases. | LOW | No | Read | No | Prod | `lookaheadDays` | Sync execution JSON | 1.8s | Manual, Auto |

---

## 6. Confluence Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `CF_CREATE_PG` | Create Page | Create a new wiki page in a target space. | LOW | No | Write | Yes | Prod | `spaceKey`, `title`, `body` | Page details JSON | 700ms | Manual, Auto |
| `CF_UPDATE_PG` | Update Page | Update page body text and title. | LOW | No | Write | Yes | Prod | `pageId`, `title`, `body`, `version` | Page details JSON | 600ms | Manual, Auto |
| `CF_DELETE_PG` | Delete Page | Move a page to the trash. | HIGH | Yes | Write | Yes | Prod | `pageId` | Success JSON | 500ms | Manual, Auto |
| `CF_ADD_COMMENT` | Comment Page | Create a comment under a page. | LOW | No | Write | Yes | Prod | `pageId`, `body` | Comment details JSON | 400ms | Manual, Auto |
| `CF_GET_ANCEST` | Get Ancestors | Fetch parent page structures. | LOW | No | Read | No | Prod | `pageId` | Ancestors list JSON | 300ms | Manual, Auto |
| `CF_CREATE_SP` | Create Space | Provision a new document space. | HIGH | Yes | Write | Yes | Prod | `spaceKey`, `name` | Space details JSON | 900ms | Manual, Auto |
| `CF_DELETE_SP` | Delete Space | Delete a space and all child pages. | CRITICAL | Yes | Write | No | Prod | `spaceKey` | Success JSON | 1.5s | Manual, Auto |
| `CF_SEARCH` | Search Space | Query documents matching text. | LOW | No | Read | No | Prod | `query`, `spaceKey` | Page array JSON | 550ms | Manual, Auto |
| `CF_APPEND_PG` | Append Content | Add text to the end of a page. | LOW | No | Write | Yes | Prod | `pageId`, `bodyToAppend` | Page details JSON | 500ms | Manual, Auto |
| `CF_EXPORT_PDF` | Export PDF | Request PDF generation for page. | LOW | No | Read | No | Prod | `pageId` | Binary file details | 2.1s | Manual, Auto |
| `CF_ADD_LABELS` | Add Labels | Apply tag metadata to a page. | LOW | No | Write | Yes | Prod | `pageId`, `labels` | Label list JSON | 300ms | Manual, Auto |
| `CF_RESTORE_VER`| Restore Version | Rollback a page to a previous revision. | MEDIUM | No | Write | Yes | Prod | `pageId`, `versionNumber` | Page details JSON | 800ms | Manual, Auto |
| `CF_SHARE_PAGE` | Share Page | Email page links to workspace users. | LOW | No | Write | No | Prod | `pageId`, `users` | Success JSON | 400ms | Manual, Auto |
| `CF_WATCH_PAGE` | Watch Page | Enable notifications for edits to a page. | LOW | No | Write | Yes | Prod | `pageId` | Success JSON | 250ms | Manual, Auto |
| `CF_RESTRICT` | Restrict Page | Lock page access permissions to specific groups. | HIGH | Yes | Write | Yes | Prod | `pageId`, `restrictions` | Restriction meta JSON | 500ms | Manual, Auto |
| `CF_MOVE_PAGE` | Move Page | Reorganize page parent hierarchies. | MEDIUM | No | Write | Yes | Prod | `pageId`, `targetParentId` | Page details JSON | 600ms | Manual, Auto |
| `CF_LIST_PAGES` | List Pages | Fetch page arrays for a target space. | LOW | No | Read | No | Prod | `spaceKey`, `limit` | Page summary JSON | 450ms | Manual, Auto |

---

## 7. Google Docs Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `GD_CREATE_DOC` | Create Document | Create a new document in Drive. | LOW | No | Write | Yes | Prod | `title` | Doc details JSON | 500ms | Manual, Auto |
| `GD_APPEND` | Append Text | Insert text at the end of a document. | LOW | No | Write | Yes | Prod | `documentId`, `text` | Success JSON | 450ms | Manual, Auto |
| `GD_INS_TABLE` | Insert Table | Add a structured data grid. | LOW | No | Write | Yes | Prod | `documentId`, `rows`, `cols` | Table details JSON | 500ms | Manual, Auto |
| `GD_REPLACE` | Replace Text | Find and replace text occurrences. | LOW | No | Write | Yes | Prod | `documentId`, `find`, `replace` | Replacement meta JSON | 450ms | Manual, Auto |
| `GD_GET_STRUCT` | Get Structure | Fetch structured headings outline of a document. | LOW | No | Read | No | Prod | `documentId` | Doc outline JSON | 300ms | Manual, Auto |
| `GD_ADD_COMM` | Add Comment | Post comment notes on text selections. | LOW | No | Write | Yes | Prod | `documentId`, `body`, `anchorId` | Comment details JSON | 400ms | Manual, Auto |
| `GD_DEL_COMM` | Delete Comment | Remove a comment. | LOW | No | Write | No | Prod | `documentId`, `commentId` | Success JSON | 300ms | Manual, Auto |
| `GD_ADD_PERM` | Share Document | Grant email read/write access. | MEDIUM | No | Write | Yes | Prod | `documentId`, `email`, `role` | Permission details | 450ms | Manual, Auto |
| `GD_REVOKE_PER` | Revoke Share | Remove shared access. | HIGH | Yes | Write | Yes | Prod | `documentId`, `permissionId` | Success JSON | 400ms | Manual, Auto |
| `GD_EXPORT_PDF` | Export PDF | Download doc formatted as PDF. | LOW | No | Read | No | Prod | `documentId` | Binary file details | 1.8s | Manual, Auto |
| `GD_MERGE_TMPL` | Merge Template | Generate doc copies replacing bracket tokens. | MEDIUM | No | Write | Yes | Prod | `templateId`, `replacements` | Doc details JSON | 1.1s | Manual, Auto |
| `GD_COPY_DOC` | Copy Document | Clone a document. | LOW | No | Write | Yes | Prod | `documentId`, `newTitle` | Doc details JSON | 600ms | Manual, Auto |
| `GD_REVISIONS` | List Revisions | Fetch revision history. | LOW | No | Read | No | Prod | `documentId` | Revision array JSON | 400ms | Manual, Auto |
| `GD_PUBLISH` | Publish to Web | Create public read-only link interface. | HIGH | Yes | Write | Yes | Prod | `documentId` | Public link JSON | 500ms | Manual, Auto |
| `GD_ADD_HEADER` | Add Header/Footer| Insert page header metadata. | LOW | No | Write | Yes | Prod | `documentId`, `text`, `isFooter` | Success JSON | 400ms | Manual, Auto |
| `GD_OUTLINE` | Get Outline | Extract text headings. | LOW | No | Read | No | Prod | `documentId` | Outline list JSON | 300ms | Manual, Auto |
| `GD_SUGGEST` | Suggest Edit | Add tracked changes suggestions. | LOW | No | Write | Yes | Prod | `documentId`, `suggestedText` | Suggestion details | 400ms | Manual, Auto |

---

## 8. Google Drive Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `DR_UPLOAD` | Upload File | Upload binary files. | MEDIUM | No | Write | Yes | Prod | `filename`, `content`, `parentId` | File metadata JSON | 1.3s | Manual, Auto |
| `DR_DOWNLOAD` | Download File | Retrieve file stream. | MEDIUM | No | Read | No | Prod | `fileId` | File stream details | 1.0s | Manual, Auto |
| `DR_DELETE` | Delete File | Move file or folder to trash. | HIGH | Yes | Write | Yes | Prod | `fileId` | Success JSON | 400ms | Manual, Auto |
| `DR_CREATE_FLD` | Create Folder | Create a directory. | LOW | No | Write | Yes | Prod | `name`, `parentId` | Folder metadata JSON | 450ms | Manual, Auto |
| `DR_MOVE_FILE` | Move File | Adjust parent folder locations. | LOW | No | Write | Yes | Prod | `fileId`, `targetFolderId` | File metadata JSON | 500ms | Manual, Auto |
| `DR_COPY_FILE` | Copy File | Clone a file. | LOW | No | Write | Yes | Prod | `fileId`, `newName` | File metadata JSON | 600ms | Manual, Auto |
| `DR_SHARE_FILE` | Share File | Add email sharing permissions. | MEDIUM | No | Write | Yes | Prod | `fileId`, `email`, `role` | Permission details | 450ms | Manual, Auto |
| `DR_REVOKE` | Revoke Share | Remove file permissions. | HIGH | Yes | Write | Yes | Prod | `fileId`, `permissionId` | Success JSON | 400ms | Manual, Auto |
| `DR_LIST_FLD` | List Folder | List folder contents. | LOW | No | Read | No | Prod | `folderId`, `limit` | File array JSON | 400ms | Manual, Auto |
| `DR_GET_META` | Get Metadata | Fetch file tags and size. | LOW | No | Read | No | Prod | `fileId` | File details JSON | 300ms | Manual, Auto |
| `DR_EMPTY_TRSH` | Empty Trash | Permanently purge trashed items. | CRITICAL | Yes | Write | No | Prod | - | Success JSON | 1.8s | Manual, Auto |
| `DR_RESTORE` | Restore File | Recover an item from the trash. | LOW | No | Write | Yes | Prod | `fileId` | File metadata JSON | 450ms | Manual, Auto |
| `DR_STAR_FILE` | Star File | Toggle starred status. | LOW | No | Write | Yes | Prod | `fileId`, `starred` | File metadata JSON | 250ms | Manual, Auto |
| `DR_SHORTCUT` | Create Shortcut | Create a reference link. | LOW | No | Write | Yes | Prod | `fileId`, `parentId` | Shortcut details | 400ms | Manual, Auto |
| `DR_REVISIONS` | Get Revisions | Retrieve file revision list. | LOW | No | Read | No | Prod | `fileId` | Revision list JSON | 450ms | Manual, Auto |
| `DR_OFFLINE` | Enable Offline | Toggle offline sync indicators. | LOW | No | Write | Yes | Prod | `fileId`, `enabled` | Success JSON | 300ms | Manual, Auto |
| `DR_AUDIT` | Audit File | Fetch file access history logs. | HIGH | Yes | Read | No | Prod | `fileId` | Audit logs JSON | 800ms | Manual, Auto |

---

## 9. Salesforce Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `SF_CREATE_LD` | Create Lead | Create a new lead record. | LOW | No | Write | Yes | Prod | `lastName`, `company`, `email`, `status`| Lead details JSON | 500ms | Manual, Auto |
| `SF_UPDATE_LD` | Update Lead | Update lead properties. | LOW | No | Write | Yes | Prod | `leadId`, `updates` | Success JSON | 450ms | Manual, Auto |
| `SF_CONVERT_LD`| Convert Lead | Convert lead to Account, Contact, and Opp. | HIGH | Yes | Write | No | Prod | `leadId`, `convertedStatus` | Conversion IDs JSON | 1.4s | Manual, Auto |
| `SF_CREATE_ACC`| Create Account | Create an Account record. | LOW | No | Write | Yes | Prod | `name`, `industry`, `billingCity` | Account details JSON | 500ms | Manual, Auto |
| `SF_UPDATE_ACC`| Update Account | Modify Account record parameters. | LOW | No | Write | Yes | Prod | `accountId`, `updates` | Success JSON | 450ms | Manual, Auto |
| `SF_CREATE_CON`| Create Contact | Create a Contact record. | LOW | No | Write | Yes | Prod | `firstName`, `lastName`, `email`, `accId`| Contact details JSON | 500ms | Manual, Auto |
| `SF_UPDATE_CON`| Update Contact | Modify Contact details. | LOW | No | Write | Yes | Prod | `contactId`, `updates` | Success JSON | 450ms | Manual, Auto |
| `SF_CREATE_OPP`| Create Opp | Create an Opportunity record. | LOW | No | Write | Yes | Prod | `name`, `stage`, `closeDate`, `accId` | Opp details JSON | 550ms | Manual, Auto |
| `SF_UPDATE_OPP`| Update Opp Stage| Update stage and probability. | MEDIUM | No | Write | Yes | Prod | `oppId`, `stageName` | Opp details JSON | 480ms | Manual, Auto |
| `SF_CREATE_CS` | Create Case | Create a customer support Case. | LOW | No | Write | Yes | Prod | `subject`, `description`, `origin` | Case details JSON | 500ms | Manual, Auto |
| `SF_UPDATE_CS` | Update Case | Modify Case status, owner, or severity. | LOW | No | Write | Yes | Prod | `caseId`, `updates` | Success JSON | 450ms | Manual, Auto |
| `SF_LOG_TASK` | Log Task | Create a Task record. | LOW | No | Write | Yes | Prod | `subject`, `status`, `priority`, `whatId`| Task details JSON | 400ms | Manual, Auto |
| `SF_LOG_CALL` | Log Call | Log details of a phone call. | LOW | No | Write | Yes | Prod | `subject`, `description`, `whoId` | Call details JSON | 400ms | Manual, Auto |
| `SF_SOQL` | Run SOQL Query | Query Salesforce records. | HIGH | Yes | Read | No | Prod | `query` | Query results JSON | 600ms | Manual, Auto |
| `SF_LIST_CAMPS` | List Campaigns | Fetch active marketing campaigns. | LOW | No | Read | No | Prod | `limit` | Campaign array JSON | 450ms | Manual, Auto |
| `SF_ADD_MEMBER` | Add Camp Member | Add a Lead or Contact to a Campaign. | LOW | No | Write | Yes | Prod | `campaignId`, `leadOrContactId` | Member details JSON | 400ms | Manual, Auto |
| `SF_DEL_REC` | Delete Record | Delete a record (Account, Opp, Lead, etc.). | CRITICAL | Yes | Write | Yes | Prod | `recordId`, `objectType` | Success JSON | 600ms | Manual, Auto |

---

## 10. HubSpot Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `HS_CREATE_CON`| Create Contact | Create a CRM Contact. | LOW | No | Write | Yes | Prod | `email`, `firstname`, `lastname`, `phone` | Contact details JSON | 500ms | Manual, Auto |
| `HS_UPDATE_CON`| Update Contact | Modify Contact details. | LOW | No | Write | Yes | Prod | `contactId`, `properties` | Success JSON | 450ms | Manual, Auto |
| `HS_CREATE_COM`| Create Company | Create a CRM Company record. | LOW | No | Write | Yes | Prod | `name`, `domain`, `industry` | Company details JSON | 500ms | Manual, Auto |
| `HS_UPDATE_COM`| Update Company | Modify Company properties. | LOW | No | Write | Yes | Prod | `companyId`, `properties` | Success JSON | 450ms | Manual, Auto |
| `HS_CREATE_DL` | Create Deal | Create a sales Deal. | LOW | No | Write | Yes | Prod | `dealname`, `pipeline`, `dealstage` | Deal details JSON | 550ms | Manual, Auto |
| `HS_UPDATE_DL` | Update Deal Stage| Modify Deal stage or value. | MEDIUM | No | Write | Yes | Prod | `dealId`, `dealstage` | Deal details JSON | 480ms | Manual, Auto |
| `HS_CREATE_TK` | Create Ticket | Create a support Ticket. | LOW | No | Write | Yes | Prod | `subject`, `content`, `hs_pipeline_stage`| Ticket details JSON | 500ms | Manual, Auto |
| `HS_UPDATE_TK` | Update Ticket | Modify Ticket status or owner. | LOW | No | Write | Yes | Prod | `ticketId`, `properties` | Success JSON | 450ms | Manual, Auto |
| `HS_LOG_MEET` | Log Meeting | Create meeting log entry. | LOW | No | Write | Yes | Prod | `title`, `startTime`, `endTime`, `contactId`| Meeting details JSON | 400ms | Manual, Auto |
| `HS_LOG_EMAIL` | Log Email | Record an outbound email conversation. | LOW | No | Write | Yes | Prod | `subject`, `body`, `contactId` | Email log details | 400ms | Manual, Auto |
| `HS_LOG_CALL` | Log Call | Record a phone call. | LOW | No | Write | Yes | Prod | `title`, `duration`, `contactId` | Call details JSON | 400ms | Manual, Auto |
| `HS_SEARCH` | Search CRM | Search Contacts, Deals, or Tickets. | LOW | No | Read | No | Prod | `query`, `objectType` | Object array JSON | 500ms | Manual, Auto |
| `HS_ADD_LIST` | Add to List | Add Contacts to a list. | LOW | No | Write | Yes | Prod | `listId`, `contactEmails` | Action status JSON | 450ms | Manual, Auto |
| `HS_REM_LIST` | Remove from List | Remove Contacts from a list. | LOW | No | Write | Yes | Prod | `listId`, `contactEmails` | Action status JSON | 450ms | Manual, Auto |
| `HS_TRIGGER_WF`| Trigger Workflow | Enroll a record in a Hubspot workflow. | HIGH | Yes | Write | No | Prod | `workflowId`, `objectId` | Success JSON | 600ms | Manual, Auto |
| `HS_SEND_EMAIL`| Send CRM Email | Send an email via the HubSpot CRM API. | MEDIUM | No | Write | No | Prod | `to`, `subject`, `body`, `contactId` | Success JSON | 800ms | Manual, Auto |
| `HS_DEL_REC` | Delete Record | Delete a Contact, Company, or Deal. | CRITICAL | Yes | Write | Yes | Prod | `recordId`, `objectType` | Success JSON | 550ms | Manual, Auto |

---

## 11. AWS Infrastructure Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `AWS_START_EC2`| Start EC2 | Power on an EC2 instance. | HIGH | Yes | Write | Yes | Prod | `instanceId`, `region` | Instance state JSON | 2.5s | Manual, Incident |
| `AWS_STOP_EC2` | Stop EC2 | Power off an EC2 instance. | HIGH | Yes | Write | Yes | Prod | `instanceId`, `region` | Instance state JSON | 2.5s | Manual, Incident |
| `AWS_REB_EC2`  | Reboot EC2 | Restart an EC2 instance. | HIGH | Yes | Write | No | Prod | `instanceId`, `region` | Success JSON | 2.1s | Manual, Incident |
| `AWS_RUN_TASK` | Run ECS Task | Execute a one-off ECS Fargate task. | MEDIUM | No | Write | No | Prod | `cluster`, `taskDefinition`, `subnets` | Task details JSON | 1.8s | Manual, Auto |
| `AWS_UPD_SRV`  | Update Service | Force redeployment on an ECS service. | HIGH | Yes | Write | Yes | Prod | `cluster`, `service`, `taskDefinition` | Service details JSON | 3.2s | Manual, Auto |
| `AWS_S3_CREATE`| Create S3 Bucket | Provision a new S3 bucket. | LOW | No | Write | Yes | Prod | `bucketName`, `region` | Bucket metadata JSON | 900ms | Manual, Auto |
| `AWS_S3_DEL`   | Delete S3 Bucket | Delete an S3 bucket. | HIGH | Yes | Write | No | Prod | `bucketName` | Success JSON | 1.1s | Manual, Auto |
| `AWS_LAMBDA`   | Invoke Lambda | Execute an AWS Lambda function. | MEDIUM | No | Write | No | Prod | `functionName`, `payload` | Function payload JSON| 800ms | Manual, Auto |
| `AWS_REB_RDS`  | Reboot RDS | Restart a relational database instance. | CRITICAL | Yes | Write | No | Prod | `dbInstanceId` | DB state JSON | 3.5s | Manual, Incident |
| `AWS_FAIL_RDS` | Failover RDS | Force failover on a Multi-AZ cluster. | CRITICAL | Yes | Write | No | Prod | `dbClusterId` | DB cluster state | 4.2s | Incident |
| `AWS_CW_METRIC`| Push CW Metric | Send custom metrics to CloudWatch. | LOW | No | Write | No | Prod | `namespace`, `metricName`, `value` | Success JSON | 300ms | Manual, Auto |
| `AWS_R53_UPD`  | Update Route53 | Modify Route 53 DNS records. | HIGH | Yes | Write | Yes | Prod | `hostedZoneId`, `recordSet` | Change info JSON | 800ms | Manual, Auto |
| `AWS_KMS_KEY`  | Create KMS Key | Generate an encryption key. | MEDIUM | No | Write | No | Prod | `description`, `keyUsage` | Key metadata JSON | 1.0s | Manual, Auto |
| `AWS_IAM_POL`  | Attach IAM Policy| Attach a policy to a role or user. | CRITICAL | Yes | Write | Yes | Prod | `roleName`, `policyArn` | Success JSON | 600ms | Manual, Auto |
| `AWS_IAM_USR`  | Create IAM User | Provision a new IAM user account. | HIGH | Yes | Write | Yes | Prod | `username`, `path` | User details JSON | 700ms | Manual, Auto |
| `AWS_GET_SEC`  | Get AWS Secret | Fetch secrets from AWS Secrets Manager. | HIGH | Yes | Read | No | Prod | `secretId` | Decrypted secret JSON| 500ms | Manual, Auto |
| `AWS_ASG_CAP`  | Set ASG Capacity | Scale Auto Scaling Group capacity. | HIGH | Yes | Write | Yes | Prod | `asgName`, `min`, `max`, `desired` | ASG status JSON | 1.2s | Manual, Auto |

---

## 12. Azure Cloud Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `AZ_START_VM` | Start VM | Power on an Azure VM. | HIGH | Yes | Write | Yes | Prod | `vmName`, `resourceGroup` | VM status JSON | 2.6s | Manual, Incident |
| `AZ_STOP_VM`  | Stop VM | Power off an Azure VM. | HIGH | Yes | Write | Yes | Prod | `vmName`, `resourceGroup` | VM status JSON | 2.5s | Manual, Incident |
| `AZ_REB_VM`   | Restart VM | Restart an Azure VM. | HIGH | Yes | Write | No | Prod | `vmName`, `resourceGroup` | Success JSON | 2.2s | Manual, Incident |
| `AZ_APP_REB`  | Restart App | Restart an App Service instance. | HIGH | Yes | Write | No | Prod | `appName`, `resourceGroup` | Success JSON | 1.9s | Manual, Incident |
| `AZ_SCALE_CAP`| Scale Container | Adjust replicas on a Container App. | MEDIUM | No | Write | Yes | Prod | `appName`, `minReplicas`, `maxReplicas`| Scale status JSON | 1.5s | Manual, Auto |
| `AZ_BLOB_CON` | Create Container| Create a Blob storage container. | LOW | No | Write | Yes | Prod | `containerName`, `accountName`| Container details | 900ms | Manual, Auto |
| `AZ_GET_SEC`  | Get KeyVault Sec | Retrieve secrets from Key Vault. | HIGH | Yes | Read | No | Prod | `vaultName`, `secretName` | Secret details JSON | 550ms | Manual, Auto |
| `AZ_COSMOS`   | CosmosDB Query | Query Cosmos DB records. | MEDIUM | No | Read | No | Prod | `endpoint`, `database`, `query` | Result JSON | 600ms | Manual, Auto |
| `AZ_FAIL_DB`  | Failover Database| Force failover on SQL Database replica. | CRITICAL | Yes | Write | No | Prod | `serverName`, `databaseName` | Failover state JSON | 3.8s | Incident |
| `AZ_ADD_USER` | Add AD User | Create a user in Microsoft Entra ID. | HIGH | Yes | Write | Yes | Prod | `displayName`, `userPrincipalName` | User details JSON | 800ms | Manual, Auto |
| `AZ_AKS_SCALE`| Scale AKS Pool | Scale Node Pool capacity. | HIGH | Yes | Write | Yes | Prod | `clusterName`, `poolName`, `count` | Node pool state JSON | 2.8s | Manual, Auto |
| `AZ_LOGIC_APP`| Trigger Logic App| Trigger an Azure Logic App workflow run. | LOW | No | Write | No | Prod | `logicAppName`, `payload` | Run ID JSON | 700ms | Manual, Auto |
| `AZ_FUNCTIONS`| Invoke Function | Execute an Azure Function. | LOW | No | Write | No | Prod | `functionAppName`, `functionName` | Payload JSON | 650ms | Manual, Auto |
| `AZ_LB_RULE`  | Update LB Rule | Update backend load balancer rules. | HIGH | Yes | Write | Yes | Prod | `lbName`, `ruleName`, `backendPoolId` | Rule details JSON | 1.1s | Manual, Auto |
| `AZ_GET_BUDG` | Get Budget | Fetch subscription cost budgets. | LOW | No | Read | No | Prod | `subscriptionId` | Budget details JSON | 450ms | Manual, Auto |
| `AZ_ALT_EN`   | Enable Alert | Toggle metric alert rules. | LOW | No | Write | Yes | Prod | `alertRuleId`, `enabled` | Success JSON | 350ms | Manual, Auto |
| `AZ_BK_TRIG`  | Trigger Backup | Start backup job on Recovery Services vault. | MEDIUM | No | Write | No | Prod | `vaultName`, `containerName` | Job details JSON | 1.5s | Manual, Auto |

---

## 13. Datadog Observability Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `DD_CREATE_MON`| Create Monitor | Provision a Datadog monitor. | LOW | No | Write | Yes | Prod | `query`, `name`, `message`, `tags` | Monitor details JSON | 500ms | Manual, Auto |
| `DD_UPDATE_MON`| Update Monitor | Modify thresholds or check queries. | LOW | No | Write | Yes | Prod | `monitorId`, `updates` | Monitor details JSON | 450ms | Manual, Auto |
| `DD_DELETE_MON`| Delete Monitor | Delete a monitor. | HIGH | Yes | Write | Yes | Prod | `monitorId` | Success JSON | 400ms | Manual, Auto |
| `DD_MUTE_MON`  | Mute Monitor | Silence alert notifications. | MEDIUM | No | Write | Yes | Prod | `monitorId`, `scope` | Mute status JSON | 350ms | Manual, Incident |
| `DD_UNMUTE`    | Unmute Monitor | Resume alert notifications. | LOW | No | Write | Yes | Prod | `monitorId` | Unmute status JSON | 350ms | Manual, Incident |
| `DD_DOWNTIME`  | Create Downtime | Schedule a maintenance window. | MEDIUM | No | Write | Yes | Prod | `scope`, `start`, `end`, `message` | Downtime details | 400ms | Manual, Incident |
| `DD_CANCEL_DW` | Cancel Downtime | Remove a scheduled downtime window. | LOW | No | Write | Yes | Prod | `downtimeId` | Success JSON | 350ms | Manual, Incident |
| `DD_SEND_EV`   | Send Event | Post a custom event to the event stream. | LOW | No | Write | No | Prod | `title`, `text`, `alertType`, `tags` | Event details JSON | 300ms | Manual, Auto |
| `DD_CREATE_DB` | Create Dashboard| Create a custom metric dashboard. | LOW | No | Write | Yes | Prod | `title`, `widgets` | Dashboard details | 600ms | Manual, Auto |
| `DD_LOG_SEARCH`| Search Logs | Query logs. | MEDIUM | No | Read | No | Prod | `query`, `from`, `to`, `limit` | Log array JSON | 700ms | Manual, Auto |
| `DD_METRIC_Q`  | Query Metrics | Fetch metric timeseries data. | LOW | No | Read | No | Prod | `query`, `from`, `to` | Series details JSON | 550ms | Manual, Auto |
| `DD_SET_SLO`   | Set SLO Target | Update targets on a Service Level Objective. | HIGH | Yes | Write | Yes | Prod | `sloId`, `target`, `warning` | SLO details JSON | 500ms | Manual, Auto |
| `DD_TELEMETRY` | Send Telemetry | Send custom metrics directly. | LOW | No | Write | No | Prod | `metric`, `points`, `host`, `tags` | Success JSON | 250ms | Manual, Auto |
| `DD_IMP_DASH`  | Import Dashboard| Import a dashboard using JSON definitions. | LOW | No | Write | Yes | Prod | `jsonDefinition` | Dashboard details | 600ms | Manual, Auto |
| `DD_CLR_ALERT` | Clear Alert | Reset alert state for a monitor. | MEDIUM | No | Write | No | Prod | `monitorId`, `resolveMessage` | Success JSON | 400ms | Incident |
| `DD_SYN_TEST`  | Trigger Syn Test| Run Synthetic tests. | LOW | No | Write | No | Prod | `publicId` | Result details JSON | 950ms | Manual, Auto |
| `DD_MUTE_SLO`  | Mute SLO Alert | Silence SLO target alert rules. | MEDIUM | No | Write | Yes | Prod | `sloId`, `duration` | Mute status JSON | 400ms | Manual, Incident |

---

## 14. PagerDuty Incident Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `PD_TRIG_INC`  | Trigger Incident| Trigger an incident. | LOW | No | Write | No | Prod | `serviceId`, `title`, `details` | Incident details JSON| 400ms | Manual, Auto |
| `PD_ACK_INC`   | Acknowledge Inc | Acknowledge an incident to halt escalation. | LOW | No | Write | Yes | Prod | `incidentId` | Incident details JSON| 350ms | Manual, Incident |
| `PD_RESOLVE`   | Resolve Incident| Resolve an incident. | LOW | No | Write | No | Prod | `incidentId` | Incident details JSON| 350ms | Manual, Incident |
| `PD_ESCALATE`  | Escalate Incident| Escalate an incident to the next level. | LOW | No | Write | No | Prod | `incidentId`, `step` | Incident details JSON| 400ms | Manual, Incident |
| `PD_ASSIGN`    | Assign Incident | Reassign an incident to a user. | LOW | No | Write | Yes | Prod | `incidentId`, `userId` | Incident details JSON| 350ms | Manual, Incident |
| `PD_ADD_NOTE`  | Add Note | Add status notes to an incident. | LOW | No | Write | Yes | Prod | `incidentId`, `note` | Note details JSON | 300ms | Manual, Incident |
| `PD_SET_PRIO`  | Set Priority | Update priority settings (e.g., P1, P2). | LOW | No | Write | Yes | Prod | `incidentId`, `priorityId` | Incident details JSON| 300ms | Manual, Incident |
| `PD_SNOOZE`    | Snooze Incident | Pause alert notifications temporarily. | MEDIUM | No | Write | Yes | Prod | `incidentId`, `duration` | Incident details JSON| 350ms | Manual, Incident |
| `PD_CREATE_POL`| Create Policy | Create an escalation policy. | HIGH | Yes | Write | Yes | Prod | `name`, `rules` | Policy details JSON | 600ms | Manual, Auto |
| `PD_SET_SCHED` | Set Schedule | Modify on-call schedules. | HIGH | Yes | Write | Yes | Prod | `scheduleId`, `updates` | Schedule details | 500ms | Manual, Auto |
| `PD_OVERRIDE`  | Create Override | Create temporary on-call schedule overrides. | LOW | No | Write | Yes | Prod | `scheduleId`, `userId`, `start`, `end` | Override details | 450ms | Manual, Auto |
| `PD_LIST_ON`   | List On-Calls | Fetch who is currently on-call. | LOW | No | Read | No | Prod | `scheduleId` | On-call user array | 300ms | Manual, Auto |
| `PD_CUSTOM_PAY`| Send Payload | Send custom webhooks payload alerts. | LOW | No | Write | No | Prod | `incidentId`, `payload` | Success JSON | 350ms | Manual, Auto |
| `PD_RUN_PLAY`  | Run Play | Trigger an automated response play. | HIGH | Yes | Write | No | Prod | `playId`, `incidentId` | Play status JSON | 600ms | Manual, Incident |
| `PD_MUTE_SRV`  | Mute Service | Pause alerts for a service. | HIGH | Yes | Write | Yes | Prod | `serviceId`, `duration` | Service status JSON | 450ms | Manual, Incident |
| `PD_ADD_RESP`  | Add Responder | Request responder assistance. | LOW | No | Write | Yes | Prod | `incidentId`, `responderId` | Request details JSON | 400ms | Manual, Incident |
| `PD_POST_UPD`  | Post Update | Broadcast status updates. | LOW | No | Write | No | Prod | `incidentId`, `message` | Update details JSON | 300ms | Manual, Incident |

---

## 15. Kubernetes Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `K8S_SCALE`    | Scale Deployment | Scale replica count. | HIGH | Yes | Write | Yes | Prod | `namespace`, `deployment`, `replicas` | Status details JSON | 1.1s | Manual, Auto |
| `K8S_RESTART`  | Rollout Restart | Force rolling update. | HIGH | Yes | Write | Yes | Prod | `namespace`, `deployment` | Rollout status JSON | 1.5s | Manual, Incident |
| `K8S_ROLLBACK` | Rollback Deploy | Rollback to previous revision. | HIGH | Yes | Write | Yes | Prod | `namespace`, `deployment`, `revision`| Rollout status JSON | 1.4s | Manual, Incident |
| `K8S_DELETE_POD`| Delete Pod | Delete a pod to trigger restart. | HIGH | Yes | Write | No | Prod | `namespace`, `podName` | Success JSON | 800ms | Incident |
| `K8S_CREATE_NS`| Create Namespace | Provision a namespace. | LOW | No | Write | Yes | Prod | `namespaceName` | Namespace details | 400ms | Manual, Auto |
| `K8S_DEL_NS`   | Delete Namespace | Delete namespace and child resources. | CRITICAL | Yes | Write | No | Prod | `namespaceName` | Success JSON | 2.5s | Manual, Auto |
| `K8S_APPLY`    | Apply Manifest | Create or update resources using YAML. | HIGH | Yes | Write | Yes | Prod | `namespace`, `manifestYaml` | Applied resources | 1.2s | Manual, Auto |
| `K8S_SCALE_STS`| Scale StatefulSet| Scale StatefulSet replicas. | HIGH | Yes | Write | Yes | Prod | `namespace`, `statefulSet`, `replicas` | Status details JSON | 1.3s | Manual, Auto |
| `K8S_POD_LOGS` | Get Pod Logs | Fetch container log outputs. | MEDIUM | No | Read | No | Prod | `namespace`, `podName`, `tail` | Log text stream | 800ms | Manual, Incident |
| `K8S_EXEC`     | Exec Command | Run shell commands inside container. | CRITICAL | Yes | Write | No | Prod | `namespace`, `podName`, `command` | Command output text | 1.5s | Manual, Incident |
| `K8S_EVICT`    | Evict Node | Evict node pods. | CRITICAL | Yes | Write | No | Prod | `nodeName` | Eviction status JSON | 2.1s | Manual, Incident |
| `K8S_CORDON`   | Cordon Node | Mark node unschedulable. | HIGH | Yes | Write | Yes | Prod | `nodeName` | Node details JSON | 600ms | Manual, Incident |
| `K8S_UNCORDON` | Uncordon Node | Mark node schedulable. | HIGH | Yes | Write | Yes | Prod | `nodeName` | Node details JSON | 600ms | Manual, Incident |
| `K8S_CONFIGMAP`| Create ConfigMap | Create configurations maps. | LOW | No | Write | Yes | Prod | `namespace`, `name`, `data` | ConfigMap metadata | 400ms | Manual, Auto |
| `K8S_SECRET`   | Update Secret | Update key-value secrets. | HIGH | Yes | Write | Yes | Prod | `namespace`, `name`, `data` | Secret metadata | 450ms | Manual, Auto |
| `K8S_PATCH_SRV`| Patch Service | Update ports or selectors on service. | HIGH | Yes | Write | Yes | Prod | `namespace`, `name`, `patchJson` | Service details JSON | 500ms | Manual, Auto |
| `K8S_JOB_TRIG` | Trigger Job | Run a Kubernetes job. | MEDIUM | No | Write | No | Prod | `namespace`, `jobYaml` | Job metadata JSON | 900ms | Manual, Auto |

---

## 16. Docker Engine Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `DK_BUILD`     | Build Image | Compile images using Dockerfile. | MEDIUM | No | Write | Yes | Prod | `contextPath`, `tags` | Build output log | 5.2s | Manual, Auto |
| `DK_PUSH`      | Push Image | Push image to remote registry. | MEDIUM | No | Write | No | Prod | `imageTag` | Registry response | 4.1s | Manual, Auto |
| `DK_PULL`      | Pull Image | Pull image from remote registry. | LOW | No | Write | Yes | Prod | `imageTag` | Registry response | 3.5s | Manual, Auto |
| `DK_START`     | Start Container | Start a stopped container. | MEDIUM | No | Write | Yes | Prod | `containerId` | Container state JSON | 900ms | Manual, Incident |
| `DK_STOP`      | Stop Container | Gracefully stop active containers. | HIGH | Yes | Write | Yes | Prod | `containerId`, `timeout` | Container state JSON | 1.8s | Manual, Incident |
| `DK_RESTART`   | Restart Container| Reboot active container instances. | HIGH | Yes | Write | No | Prod | `containerId` | Container state JSON | 1.2s | Manual, Incident |
| `DK_KILL`      | Kill Container | Send SIGKILL to force stop container. | HIGH | Yes | Write | No | Prod | `containerId` | Container state JSON | 800ms | Incident |
| `DK_DELETE`    | Delete Container | Remove stopped container. | HIGH | Yes | Write | Yes | Prod | `containerId` | Success JSON | 500ms | Manual, Auto |
| `DK_PRUNE`     | Prune System | Prune unused containers and networks. | CRITICAL | Yes | Write | No | Prod | `pruneAll` | Prune details JSON | 2.8s | Manual, Auto |
| `DK_LOGS`      | Container Logs | Fetch stdout/stderr outputs. | MEDIUM | No | Read | No | Prod | `containerId`, `tailLines` | Log text stream | 750ms | Manual, Incident |
| `DK_CREATE_VOL`| Create Volume | Provision persistent storage volumes. | LOW | No | Write | Yes | Prod | `volumeName`, `driver` | Volume metadata JSON | 400ms | Manual, Auto |
| `DK_DELETE_VOL`| Delete Volume | Delete storage volumes. | HIGH | Yes | Write | Yes | Prod | `volumeName` | Success JSON | 450ms | Manual, Auto |
| `DK_CREATE_NET`| Create Network | Create container network paths. | LOW | No | Write | Yes | Prod | `networkName`, `driver` | Network metadata JSON| 400ms | Manual, Auto |
| `DK_INSPECT`   | Inspect Container| Fetch configuration configurations. | LOW | No | Read | No | Prod | `containerId` | Configuration details| 300ms | Manual, Auto |
| `DK_TAG_IMAGE` | Tag Image | Assign tag label names. | LOW | No | Write | Yes | Prod | `sourceImage`, `targetTag` | Success JSON | 250ms | Manual, Auto |
| `DK_EXPORT`    | Export Image | Archive image states. | MEDIUM | No | Read | No | Prod | `imageName` | Binary export details| 3.2s | Manual, Auto |
| `DK_IMPORT`    | Import Image | Load tar archives. | MEDIUM | No | Write | Yes | Prod | `tarPath`, `imageTag` | Success JSON | 2.5s | Manual, Auto |

---

## 17. Redis In-Memory Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `RD_SET_KEY`   | Set Key | Set key-value string values. | LOW | No | Write | Yes | Prod | `key`, `value`, `ttl` | Success JSON | 100ms | Manual, Auto |
| `RD_GET_KEY`   | Get Key | Fetch string values. | LOW | No | Read | No | Prod | `key` | Value details JSON | 100ms | Manual, Auto |
| `RD_DEL_KEY`   | Delete Key | Delete keys. | MEDIUM | No | Write | Yes | Prod | `key` | Success JSON | 150ms | Manual, Auto |
| `RD_EXPIRE`    | Expire Key | Set TTL timer values. | LOW | No | Write | Yes | Prod | `key`, `seconds` | Success JSON | 120ms | Manual, Auto |
| `RD_FLUSH_DB`  | Flush DB | Flush all cached keys. | CRITICAL | Yes | Write | No | Prod | `async` | Success JSON | 900ms | Manual, Auto |
| `RD_HSET`      | Set Hash Field | Update key properties in Hash. | LOW | No | Write | Yes | Prod | `key`, `field`, `value` | Success JSON | 120ms | Manual, Auto |
| `RD_HGET`      | Get Hash Fields | Retrieve Hash mappings. | LOW | No | Read | No | Prod | `key`, `field` | Value details JSON | 100ms | Manual, Auto |
| `RD_LPUSH`     | Push List | Push values to List structure. | LOW | No | Write | Yes | Prod | `key`, `value` | List length JSON | 120ms | Manual, Auto |
| `RD_LPOP`      | Pop List | Pop values from List structure. | LOW | No | Write | No | Prod | `key` | Popped value JSON | 120ms | Manual, Auto |
| `RD_SADD`      | Add Set Member | Add keys to Set structures. | LOW | No | Write | Yes | Prod | `key`, `member` | Set status JSON | 120ms | Manual, Auto |
| `RD_ZADD`      | Add ZSet Member | Add values to Sorted Set index. | LOW | No | Write | Yes | Prod | `key`, `score`, `member` | Set status JSON | 130ms | Manual, Auto |
| `RD_ZRANGE`    | Query ZSet Range| Query range indices in Sorted Set. | LOW | No | Read | No | Prod | `key`, `start`, `stop` | Member array JSON | 120ms | Manual, Auto |
| `RD_PUBLISH`   | Publish Message | Broadcast messages to Pub/Sub. | LOW | No | Write | No | Prod | `channel`, `message` | Client count JSON | 150ms | Manual, Auto |
| `RD_CONFIG_SET`| Config Set Param| Set runtime parameters. | HIGH | Yes | Write | Yes | Prod | `parameter`, `value` | Success JSON | 300ms | Manual, Auto |
| `RD_MONITOR`   | Monitor Command | Monitor command execution logs. | HIGH | Yes | Read | No | Prod | `durationSeconds` | Trace logs JSON | 1.1s | Manual, Auto |
| `RD_SAVE`      | DB Save | Force RDB snapshot save. | HIGH | Yes | Write | No | Prod | `background` | Success JSON | 1.3s | Manual, Auto |
| `RD_MEM_USAGE` | Check Memory | Check memory footprint sizes. | LOW | No | Read | No | Prod | `key` | Bytes count JSON | 150ms | Manual, Auto |

---

## 18. PostgreSQL Database Actions

| Action ID | Display Name | Description | Risk Level | Approval | Category | Rollback | Status | Inputs | Outputs | Est. Dur. | Workflows |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `PG_EXECUTE`   | Execute Query | Execute parameterized SQL. | CRITICAL | Yes | Write | Yes | Prod | `sql`, `params` | Query results JSON | 400ms | Manual, Auto |
| `PG_INSERT`    | Insert Row | Insert a record. | LOW | No | Write | Yes | Prod | `tableName`, `rowData` | Created record JSON | 200ms | Manual, Auto |
| `PG_UPDATE`    | Update Row | Modify record columns. | MEDIUM | No | Write | Yes | Prod | `tableName`, `rowData`, `where` | Updated count JSON | 250ms | Manual, Auto |
| `PG_DELETE`    | Delete Row | Delete database records. | HIGH | Yes | Write | Yes | Prod | `tableName`, `where` | Deleted count JSON | 300ms | Manual, Auto |
| `PG_CREATE_TBL`| Create Table | Run DDL table creation commands. | HIGH | Yes | Write | Yes | Prod | `tableName`, `columns` | Success JSON | 500ms | Manual, Auto |
| `PG_ALTER_TBL` | Alter Table | Add/remove table columns. | HIGH | Yes | Write | Yes | Prod | `tableName`, `alterSql` | Success JSON | 500ms | Manual, Auto |
| `PG_DROP_TBL`  | Drop Table | Drop database tables. | CRITICAL | Yes | Write | No | Prod | `tableName` | Success JSON | 600ms | Manual, Auto |
| `PG_TRUNCATE`  | Truncate Table | Truncate database tables. | CRITICAL | Yes | Write | No | Prod | `tableName` | Success JSON | 400ms | Manual, Auto |
| `PG_REBOOT_CON`| Reboot Pool | Reboot the connection pool. | HIGH | Yes | Write | No | Prod | - | Success JSON | 950ms | Incident |
| `PG_CREATE_IDX`| Create Index | Build index definitions. | HIGH | Yes | Write | Yes | Prod | `tableName`, `indexSql` | Success JSON | 800ms | Manual, Auto |
| `PG_ANALYZE`   | Analyze Table | Gather statistics for tables. | LOW | No | Write | No | Prod | `tableName` | Success JSON | 600ms | Manual, Auto |
| `PG_EXPLAIN`   | Explain Plan | Explain SQL query execution plans. | LOW | No | Read | No | Prod | `sql` | Explain plan text | 300ms | Manual, Auto |
| `PG_TERM_BACK` | Terminate Client| Force kill a backend client PID. | HIGH | Yes | Write | No | Prod | `pid` | Success JSON | 300ms | Incident |
| `PG_LOCK_TBL`  | Lock Table | Acquire exclusive write locks. | HIGH | Yes | Write | No | Prod | `tableName`, `mode` | Success JSON | 350ms | Manual, Auto |
| `PG_VACUUM`    | Vacuum Database | Run VACUUM database optimization. | HIGH | Yes | Write | No | Prod | `tableName`, `analyze` | Success JSON | 1.8s | Manual, Auto |
| `PG_BEGIN`     | Begin Trans | Open SQL transactions. | LOW | No | Write | No | Prod | - | Success JSON | 100ms | Manual, Auto |
| `PG_COMMIT`    | Commit Trans | Commit SQL transactions. | LOW | No | Write | No | Prod | - | Success JSON | 150ms | Manual, Auto |
