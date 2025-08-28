const axios = require('axios');

class GitHubService {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.oauthURL = 'https://github.com/login/oauth';
    }

    /**
     * Generate GitHub OAuth authorization URL
     */
    generateAuthUrl(state, scopes = ['repo', 'user:email', 'read:org']) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) {
            throw new Error('GitHub client ID not configured');
        }

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/user-integrations/github/callback`,
            scope: scopes.join(' '),
            state: state,
            allow_signup: 'true'
        });

        return `${this.oauthURL}/authorize?${params.toString()}`;
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code, state) {
        try {
            const response = await axios.post(`${this.oauthURL}/access_token`, {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/user-integrations/github/callback`,
                state: state
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.error) {
                throw new Error(`GitHub OAuth error: ${response.data.error_description || response.data.error}`);
            }

            return {
                accessToken: response.data.access_token,
                tokenType: response.data.token_type,
                scope: response.data.scope
            };
        } catch (error) {
            console.error('GitHub token exchange error:', error);
            throw new Error('Failed to exchange code for access token');
        }
    }

    /**
     * Get authenticated user information
     */
    async getUser(accessToken) {
        try {
            const response = await axios.get(`${this.baseURL}/user`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return {
                id: response.data.id,
                login: response.data.login,
                name: response.data.name,
                email: response.data.email,
                avatarUrl: response.data.avatar_url,
                company: response.data.company,
                location: response.data.location,
                publicRepos: response.data.public_repos,
                privateRepos: response.data.total_private_repos,
                followers: response.data.followers,
                following: response.data.following
            };
        } catch (error) {
            console.error('GitHub get user error:', error);
            throw new Error('Failed to get user information');
        }
    }

    /**
     * Get user repositories
     */
    async getRepositories(accessToken, options = {}) {
        try {
            const {
                type = 'all', // all, owner, member
                sort = 'updated', // created, updated, pushed, full_name
                direction = 'desc', // asc, desc
                per_page = 30,
                page = 1,
                affiliation = 'owner,collaborator,organization_member'
            } = options;

            const params = new URLSearchParams({
                type,
                sort,
                direction,
                per_page: per_page.toString(),
                page: page.toString(),
                affiliation
            });

            const response = await axios.get(`${this.baseURL}/user/repos?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.data.map(repo => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                private: repo.private,
                htmlUrl: repo.html_url,
                cloneUrl: repo.clone_url,
                sshUrl: repo.ssh_url,
                defaultBranch: repo.default_branch,
                language: repo.language,
                size: repo.size,
                stargazersCount: repo.stargazers_count,
                watchersCount: repo.watchers_count,
                forksCount: repo.forks_count,
                openIssuesCount: repo.open_issues_count,
                createdAt: repo.created_at,
                updatedAt: repo.updated_at,
                pushedAt: repo.pushed_at,
                owner: {
                    id: repo.owner.id,
                    login: repo.owner.login,
                    avatarUrl: repo.owner.avatar_url,
                    type: repo.owner.type
                }
            }));
        } catch (error) {
            console.error('GitHub get repositories error:', error);
            throw new Error('Failed to get repositories');
        }
    }

    /**
     * Get repository branches
     */
    async getBranches(accessToken, owner, repo, options = {}) {
        try {
            const { per_page = 30, page = 1 } = options;

            const params = new URLSearchParams({
                per_page: per_page.toString(),
                page: page.toString()
            });

            const response = await axios.get(`${this.baseURL}/repos/${owner}/${repo}/branches?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.data.map(branch => ({
                name: branch.name,
                commit: {
                    sha: branch.commit.sha,
                    url: branch.commit.url
                },
                protected: branch.protected
            }));
        } catch (error) {
            console.error('GitHub get branches error:', error);
            throw new Error('Failed to get repository branches');
        }
    }

    /**
     * Get repository commits
     */
    async getCommits(accessToken, owner, repo, options = {}) {
        try {
            const {
                sha, // SHA or branch to start listing commits from
                path, // Only commits containing this file path
                author, // GitHub login or email address
                since, // ISO 8601 date format: YYYY-MM-DDTHH:MM:SSZ
                until, // ISO 8601 date format: YYYY-MM-DDTHH:MM:SSZ
                per_page = 30,
                page = 1
            } = options;

            const params = new URLSearchParams({
                per_page: per_page.toString(),
                page: page.toString()
            });

            if (sha) params.append('sha', sha);
            if (path) params.append('path', path);
            if (author) params.append('author', author);
            if (since) params.append('since', since);
            if (until) params.append('until', until);

            const response = await axios.get(`${this.baseURL}/repos/${owner}/${repo}/commits?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.data.map(commit => ({
                sha: commit.sha,
                message: commit.commit.message,
                author: {
                    name: commit.commit.author.name,
                    email: commit.commit.author.email,
                    date: commit.commit.author.date
                },
                committer: {
                    name: commit.commit.committer.name,
                    email: commit.commit.committer.email,
                    date: commit.commit.committer.date
                },
                url: commit.html_url,
                apiUrl: commit.url
            }));
        } catch (error) {
            console.error('GitHub get commits error:', error);
            throw new Error('Failed to get repository commits');
        }
    }

    /**
     * Get repository issues
     */
    async getIssues(accessToken, owner, repo, options = {}) {
        try {
            const {
                milestone, // Milestone number or 'none' or '*'
                state = 'open', // open, closed, all
                assignee, // Username or 'none' or '*'
                creator, // Username
                mentioned, // Username
                labels, // Comma-separated list of label names
                sort = 'created', // created, updated, comments
                direction = 'desc', // asc, desc
                since, // ISO 8601 date format
                per_page = 30,
                page = 1
            } = options;

            const params = new URLSearchParams({
                state,
                sort,
                direction,
                per_page: per_page.toString(),
                page: page.toString()
            });

            if (milestone) params.append('milestone', milestone);
            if (assignee) params.append('assignee', assignee);
            if (creator) params.append('creator', creator);
            if (mentioned) params.append('mentioned', mentioned);
            if (labels) params.append('labels', labels);
            if (since) params.append('since', since);

            const response = await axios.get(`${this.baseURL}/repos/${owner}/${repo}/issues?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.data.map(issue => ({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                locked: issue.locked,
                assignees: issue.assignees.map(assignee => ({
                    id: assignee.id,
                    login: assignee.login,
                    avatarUrl: assignee.avatar_url
                })),
                labels: issue.labels.map(label => ({
                    id: label.id,
                    name: label.name,
                    color: label.color,
                    description: label.description
                })),
                createdAt: issue.created_at,
                updatedAt: issue.updated_at,
                closedAt: issue.closed_at,
                htmlUrl: issue.html_url,
                user: {
                    id: issue.user.id,
                    login: issue.user.login,
                    avatarUrl: issue.user.avatar_url
                }
            }));
        } catch (error) {
            console.error('GitHub get issues error:', error);
            throw new Error('Failed to get repository issues');
        }
    }

    /**
     * Get user organizations
     */
    async getOrganizations(accessToken) {
        try {
            const response = await axios.get(`${this.baseURL}/user/orgs`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.data.map(org => ({
                id: org.id,
                login: org.login,
                name: org.name,
                description: org.description,
                avatarUrl: org.avatar_url,
                htmlUrl: org.html_url,
                publicRepos: org.public_repos
            }));
        } catch (error) {
            console.error('GitHub get organizations error:', error);
            throw new Error('Failed to get user organizations');
        }
    }

    /**
     * Validate access token
     */
    async validateToken(accessToken) {
        try {
            const response = await axios.get(`${this.baseURL}/user`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return {
                valid: true,
                user: {
                    id: response.data.id,
                    login: response.data.login,
                    name: response.data.name,
                    email: response.data.email
                },
                scopes: response.headers['x-oauth-scopes']?.split(', ') || []
            };
        } catch (error) {
            return {
                valid: false,
                error: error.response?.data?.message || 'Invalid token'
            };
        }
    }
}

module.exports = new GitHubService();
