/**
 * FLOW OS — Connector Adapter Registration
 *
 * All adapters self-register here at startup via registerConnector().
 * Import this module once in server.js — side effects populate the registry.
 * New providers: add one import + one registerConnector() call.
 */

import { registerConnector }          from '../registry.js';
import gmailAdapter                   from './GmailAdapter.js';
import googleCalendarAdapter          from './GoogleCalendarAdapter.js';
import gitHubAdapter                  from './GitHubAdapter.js';
import jiraAdapter                    from './JiraAdapter.js';
import notionAdapter                  from './NotionAdapter.js';
import confluenceAdapter              from './ConfluenceAdapter.js';
import googleDriveAdapter             from './GoogleDriveAdapter.js';
import hubSpotAdapter                 from './HubSpotAdapter.js';
import salesforceAdapter              from './SalesforceAdapter.js';
import workdayAdapter                 from './WorkdayAdapter.js';
import bambooHRAdapter                from './BambooHRAdapter.js';
import slackAdapter                   from './SlackAdapter.js';
// Infrastructure Operations Pack (Phase 10)
import kubernetesAdapter              from './KubernetesAdapter.js';
import awsAdapter                     from './AWSAdapter.js';
import postgresAdapter                from './PostgreSQLAdapter.js';
import redisInfraAdapter              from './RedisAdapter.js';
import datadogAdapter                 from './DatadogAdapter.js';
import pagerDutyAdapter               from './PagerDutyAdapter.js';
// Governed sandbox execution provider (certification only, fail-closed)
import sandboxAdapter                 from './SandboxAdapter.js';

registerConnector(gmailAdapter);
registerConnector(googleCalendarAdapter);
registerConnector(gitHubAdapter);
registerConnector(jiraAdapter);
registerConnector(notionAdapter);
registerConnector(confluenceAdapter);
registerConnector(googleDriveAdapter);
registerConnector(hubSpotAdapter);
registerConnector(salesforceAdapter);
registerConnector(workdayAdapter);
registerConnector(bambooHRAdapter);
registerConnector(slackAdapter);
// Infrastructure Operations Pack
registerConnector(kubernetesAdapter);
registerConnector(awsAdapter);
registerConnector(postgresAdapter);
registerConnector(redisInfraAdapter);
registerConnector(datadogAdapter);
registerConnector(pagerDutyAdapter);
// Sandbox provider — registered always, but execute() is fail-closed to the
// certification workspace (never production, never a real-provider substitute).
registerConnector(sandboxAdapter);
