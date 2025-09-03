const axios = require('axios');

class JiraService {
    constructor() {
        this.oauthURL = 'https://auth.atlassian.com/authorize';
        this.tokenURL = 'https://auth.atlassian.com/oauth/token';
        this.apiURL = 'https://api.atlassian.com';
    }

    /**
     * Generate Jira OAuth authorization URL
     */
    generateAuthUrl(state, scopes = [
        'read:jira-work',
        'read:jira-user',
        'manage:jira-project',
        'read:board-scope:jira-software',
        'read:project:jira'
    ]) {
        const clientId = process.env.JIRA_CLIENT_ID;
        if (!clientId) {
            throw new Error('Jira client ID not configured');
        }

        const params = new URLSearchParams({
            audience: 'api.atlassian.com',
            client_id: clientId,
            scope: scopes.join(' '),
            redirect_uri: process.env.JIRA_REDIRECT_URI || `${process.env.BACKEND_URL}/api/user-integrations/oauth/callback/jira`,
            state: state,
            response_type: 'code',
            prompt: 'consent'
        });

        return `${this.oauthURL}?${params.toString()}`;
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code, state) {
        try {
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: process.env.JIRA_CLIENT_ID,
                client_secret: process.env.JIRA_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.JIRA_REDIRECT_URI || `${process.env.BACKEND_URL}/api/user-integrations/oauth/callback/jira`
            });

            const response = await axios.post(this.tokenURL, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                tokenType: response.data.token_type,
                expiresIn: response.data.expires_in,
                scope: response.data.scope
            };
        } catch (error) {
            console.error('Jira token exchange error:', error);
            throw new Error('Failed to exchange code for access token');
        }
    }

    /**
     * Refresh access token
     */
    async refreshAccessToken(refreshToken) {
        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: process.env.JIRA_CLIENT_ID,
                client_secret: process.env.JIRA_CLIENT_SECRET,
                refresh_token: refreshToken
            });

            const response = await axios.post(this.tokenURL, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                tokenType: response.data.token_type,
                expiresIn: response.data.expires_in,
                scope: response.data.scope
            };
        } catch (error) {
            console.error('Jira token refresh error:', error);
            throw new Error('Failed to refresh access token');
        }
    }

    /**
     * Get accessible resources (Jira sites)
     */
    async getAccessibleResources(accessToken) {
        try {
            const response = await axios.get(`${this.apiURL}/oauth/token/accessible-resources`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            return response.data.map(resource => ({
                id: resource.id,
                name: resource.name,
                url: resource.url,
                scopes: resource.scopes,
                avatarUrl: resource.avatarUrl
            }));
        } catch (error) {
            console.error('Jira get accessible resources error:', error);
            throw new Error('Failed to get accessible resources');
        }
    }

    /**
     * Get current user information
     */
    async getCurrentUser(accessToken, cloudId) {
        try {
            const response = await axios.get(`${this.apiURL}/ex/jira/${cloudId}/rest/api/3/myself`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            return {
                accountId: response.data.accountId,
                accountType: response.data.accountType,
                emailAddress: response.data.emailAddress,
                displayName: response.data.displayName,
                active: response.data.active,
                timeZone: response.data.timeZone,
                locale: response.data.locale,
                avatarUrls: response.data.avatarUrls
            };
        } catch (error) {
            console.error('Jira get current user error:', error);
            throw new Error('Failed to get current user');
        }
    }

    /**
     * Get all projects
     */
    async getProjects(accessToken, cloudId, options = {}) {
        try {
            const {
                expand = 'description,lead,issueTypes,url,projectKeys,permissions,insight',
                recent = 20,
                properties = []
            } = options;

            const params = new URLSearchParams({
                expand,
                recent: recent.toString()
            });

            if (properties.length > 0) {
                params.append('properties', properties.join(','));
            }

            const response = await axios.get(`${this.apiURL}/ex/jira/${cloudId}/rest/api/3/project/search?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            console.log("JIRA_RESPONSE ====> ",response);

            return response.data.values.map(project => ({
                id: project.id,
                key: project.key,
                name: project.name,
                description: project.description,
                projectTypeKey: project.projectTypeKey,
                simplified: project.simplified,
                style: project.style,
                isPrivate: project.isPrivate,
                url: project.self,
                avatarUrls: project.avatarUrls,
                lead: project.lead ? {
                    accountId: project.lead.accountId,
                    displayName: project.lead.displayName,
                    emailAddress: project.lead.emailAddress,
                    avatarUrls: project.lead.avatarUrls
                } : null,
                issueTypes: project.issueTypes?.map(issueType => ({
                    id: issueType.id,
                    name: issueType.name,
                    description: issueType.description,
                    iconUrl: issueType.iconUrl,
                    subtask: issueType.subtask
                })) || []
            }));
        } catch (error) {
            console.error('Jira get projects error:', error);
            throw new Error('Failed to get projects');
        }
    }

    /**
     * Get all boards
     */
    async getBoards(accessToken, cloudId, options = {}) {
        try {
            const {
                startAt = 0,
                maxResults = 50,
                type, // scrum, kanban, simple
                name, // Filter by board name
                projectKeyOrId, // Filter by project
                accountIdLocation, // Filter by account ID
                projectLocation, // Filter by project location
                includePrivate = false,
                negateLocationFiltering = false,
                orderBy = 'name', // name, -name, +name
                expand = 'admins,permissions'
            } = options;

            const params = new URLSearchParams({
                startAt: startAt.toString(),
                maxResults: maxResults.toString(),
                includePrivate: includePrivate.toString(),
                negateLocationFiltering: negateLocationFiltering.toString(),
                orderBy,
                expand
            });

            if (type) params.append('type', type);
            if (name) params.append('name', name);
            if (projectKeyOrId) params.append('projectKeyOrId', projectKeyOrId);
            if (accountIdLocation) params.append('accountIdLocation', accountIdLocation);
            if (projectLocation) params.append('projectLocation', projectLocation);

            const response = await axios.get(`${this.apiURL}/ex/jira/${cloudId}/rest/agile/1.0/board?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            return {
                boards: response.data.values.map(board => ({
                    id: board.id,
                    name: board.name,
                    type: board.type,
                    self: board.self,
                    location: board.location ? {
                        projectId: board.location.projectId,
                        projectName: board.location.projectName,
                        projectKey: board.location.projectKey,
                        projectTypeKey: board.location.projectTypeKey,
                        avatarURI: board.location.avatarURI,
                        name: board.location.name
                    } : null,
                    filter: board.filter ? {
                        id: board.filter.id,
                        name: board.filter.name,
                        self: board.filter.self
                    } : null
                })),
                startAt: response.data.startAt,
                maxResults: response.data.maxResults,
                total: response.data.total,
                isLast: response.data.isLast
            };
        } catch (error) {
            console.error('Jira get boards error:', error);
            throw new Error('Failed to get boards');
        }
    }

    /**
     * Get issues for a board
     */
    async getBoardIssues(accessToken, cloudId, boardId, options = {}) {
        try {
            const {
                startAt = 0,
                maxResults = 50,
                jql, // JQL query
                validateQuery = true,
                fields = ['summary', 'status', 'assignee', 'reporter', 'priority', 'issuetype', 'created', 'updated'],
                expand = []
            } = options;

            const params = new URLSearchParams({
                startAt: startAt.toString(),
                maxResults: maxResults.toString(),
                validateQuery: validateQuery.toString()
            });

            if (jql) params.append('jql', jql);
            if (fields.length > 0) params.append('fields', fields.join(','));
            if (expand.length > 0) params.append('expand', expand.join(','));

            const response = await axios.get(`${this.apiURL}/ex/jira/${cloudId}/rest/agile/1.0/board/${boardId}/issue?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            return {
                issues: response.data.issues.map(issue => ({
                    id: issue.id,
                    key: issue.key,
                    self: issue.self,
                    fields: {
                        summary: issue.fields.summary,
                        status: issue.fields.status ? {
                            id: issue.fields.status.id,
                            name: issue.fields.status.name,
                            statusCategory: issue.fields.status.statusCategory
                        } : null,
                        assignee: issue.fields.assignee ? {
                            accountId: issue.fields.assignee.accountId,
                            displayName: issue.fields.assignee.displayName,
                            emailAddress: issue.fields.assignee.emailAddress,
                            avatarUrls: issue.fields.assignee.avatarUrls
                        } : null,
                        reporter: issue.fields.reporter ? {
                            accountId: issue.fields.reporter.accountId,
                            displayName: issue.fields.reporter.displayName,
                            emailAddress: issue.fields.reporter.emailAddress,
                            avatarUrls: issue.fields.reporter.avatarUrls
                        } : null,
                        priority: issue.fields.priority ? {
                            id: issue.fields.priority.id,
                            name: issue.fields.priority.name,
                            iconUrl: issue.fields.priority.iconUrl
                        } : null,
                        issuetype: issue.fields.issuetype ? {
                            id: issue.fields.issuetype.id,
                            name: issue.fields.issuetype.name,
                            iconUrl: issue.fields.issuetype.iconUrl,
                            subtask: issue.fields.issuetype.subtask
                        } : null,
                        created: issue.fields.created,
                        updated: issue.fields.updated
                    }
                })),
                startAt: response.data.startAt,
                maxResults: response.data.maxResults,
                total: response.data.total
            };
        } catch (error) {
            console.error('Jira get board issues error:', error);
            throw new Error('Failed to get board issues');
        }
    }

    /**
     * Get sprints for a board
     */
    async getBoardSprints(accessToken, cloudId, boardId, options = {}) {
        try {
            const {
                startAt = 0,
                maxResults = 50,
                state // active, closed, future
            } = options;

            const params = new URLSearchParams({
                startAt: startAt.toString(),
                maxResults: maxResults.toString()
            });

            if (state) params.append('state', state);

            const response = await axios.get(`${this.apiURL}/ex/jira/${cloudId}/rest/agile/1.0/board/${boardId}/sprint?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            return {
                sprints: response.data.values.map(sprint => ({
                    id: sprint.id,
                    name: sprint.name,
                    state: sprint.state,
                    startDate: sprint.startDate,
                    endDate: sprint.endDate,
                    completeDate: sprint.completeDate,
                    originBoardId: sprint.originBoardId,
                    goal: sprint.goal
                })),
                startAt: response.data.startAt,
                maxResults: response.data.maxResults,
                total: response.data.total,
                isLast: response.data.isLast
            };
        } catch (error) {
            console.error('Jira get board sprints error:', error);
            throw new Error('Failed to get board sprints');
        }
    }

    /**
     * Validate access token
     */
    async validateToken(accessToken) {
        try {
            const resources = await this.getAccessibleResources(accessToken);
            return {
                valid: true,
                resources: resources
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message || 'Invalid token'
            };
        }
    }
}

module.exports = new JiraService();
