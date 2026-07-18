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
