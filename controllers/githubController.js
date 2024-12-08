const passport = require('passport');
const axios = require('axios');

const User = require('../models/githubIntegration');

exports.checkStatus = (req, res) => {
    if (req.isAuthenticated()) {
        User.findOne({ githubId: req.user.githubId })
            .then(user => {
                if (user) {
                    return res.json({
                        connectedAt: user.connectedAt,
                        profile: {
                            username: user.profile.username,
                            photos: user.profile.photos[0].value,
                            user_view_type: user.profile._json.user_view_type
                        }
                    });
                } else {
                    return res.status(404).json({ message: 'GitHub not connected' });
                }
            })
            .catch(err => res.status(500).json({ error: 'Internal server error' }));
    } else {
        return res.status(401).json({ message: 'Not authenticated' });
    }
};

exports.authGitHub = passport.authenticate('github', { scope: ['user', 'repo'] });

// GitHub callback to handle success/failure
exports.githubCallback = (req, res) => {
    res.redirect('http://localhost:4200');
};

exports.getRepoDetails = async (req, res) => {
    const { org, repo } = req.params;

    const fetchAllPages = async (baseUrl, headers, params = {}) => {
        let results = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `${baseUrl}?${new URLSearchParams({ ...params, page, per_page: 100 }).toString()}`;
            console.log(`Fetching: ${url}`);
            try {
                const response = await axios.get(url, { headers });
                results = results.concat(response.data);

                // If fewer than 100 items are returned, we are at the last page
                if (response.data.length < 100) {
                    hasMore = false;
                } else {
                    page++;
                }
            } catch (error) {
                if (error.response) {
                    console.error('Error response status:', error.response.status);
                    console.error('Error response data:', error.response.data);
                } else {
                    console.error('Error:', error.message);
                }
                throw new Error('Failed to fetch paginated data');
            }
        }

        return results;
    };

    const fetchCount = async (url, headers, params = {}) => {
        try {
            const query = new URLSearchParams({ ...params, per_page: 1 }).toString();
            const response = await axios.get(`${url}?${query}`, { headers });

            const linkHeader = response.headers.link;
            if (linkHeader) {
                const lastPageMatch = linkHeader.match(/&page=(\d+)>; rel="last"/);
                if (lastPageMatch) {
                    return parseInt(lastPageMatch[1], 10); // Total count based on last page number
                }
            }

            // For GitHub Search API, use total_count directly
            if (response.data.total_count !== undefined) {
                return response.data.total_count;
            }

            // Fallback if no pagination headers are present
            return response.data.length || 0;
        } catch (error) {
            if (error.response) {
                console.error('Error response status:', error.response.status);
                console.error('Error response data:', error.response.data);
            } else {
                console.error('Error:', error.message);
            }
            throw new Error('Failed to fetch count');
        }
    };

    try {
        const headers = {
            Authorization: `Bearer ${req.user.accessToken}`
        };

        // Fetch counts
        const commitsCount = await fetchCount(
            `https://api.github.com/repos/${org}/${repo}/commits`,
            headers
        );

        const issuesCount = await fetchCount(
            `https://api.github.com/search/issues`,
            headers,
            { q: `repo:${org}/${repo} type:issue` } // Search issues in the repository
        );

        const pullRequestsCount = await fetchCount(
            `https://api.github.com/repos/${org}/${repo}/pulls`,
            headers,
            { state: 'all' } // Fetch all PRs
        );

        // Fetch all commits, pull requests, and issues
        const commits = await fetchAllPages(
            `https://api.github.com/repos/${org}/${repo}/commits`,
            headers
        );
        const pullRequests = await fetchAllPages(
            `https://api.github.com/repos/${org}/${repo}/pulls`,
            headers,
            { state: 'all' }
        );
        const issues = await fetchAllPages(
            `https://api.github.com/repos/${org}/${repo}/issues`,
            headers,
            { state: 'all' }
        );

        const userStats = {};
        commits.forEach((commit) => {
            const user = commit.commit.author?.name || 'Unknown';
            if (!userStats[user]) {
                userStats[user] = { commits: 0, pullRequests: 0, issues: 0 };
            }
            userStats[user].commits++;
        });

        pullRequests.forEach((pr) => {
            const user = pr.user?.login || 'Unknown';
            if (!userStats[user]) {
                userStats[user] = { commits: 0, pullRequests: 0, issues: 0 };
            }
            userStats[user].pullRequests++;
        });

        issues.forEach((issue) => {
            const user = issue.user?.login || 'Unknown';
            if (!userStats[user]) {
                userStats[user] = { commits: 0, pullRequests: 0, issues: 0 };
            }
            userStats[user].issues++;
        });

        res.json({
            counts: {
                commitsCount,
                pullRequestsCount,
                issuesCount
            },
            data: {
                commits,
                pullRequests,
                issues
            },
            userStats
        });
    } catch (error) {
        if (error.response) {
            console.error('Error response status:', error.response.status);
            console.error('Error response data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
        res.status(500).json({ error: 'Failed to fetch repository details' });
    }
};


exports.disconnectGitHub = async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            await User.findOneAndDelete({ githubId: req.user.githubId });
            req.logout((err) => {
                if (err) return res.status(500).json({ error: 'Logout failed' });
                res.json({ message: 'GitHub integration disconnected successfully' });
            });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to disconnect GitHub' });
        }
    } else {
        return res.status(401).json({ message: 'Not authenticated' });
    }
};

exports.getOrganizationsRepos = async (req, res) => {
    console.log('Fetching organizations...');

    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    try {

        const response = await axios.get('https://api.github.com/user/orgs', {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            }
        });

        const organizations = response.data;
        const allRepos = await Promise.all(organizations.map(async (org) => {
            return getRepositoriesForOrganization(org.login, req.user.accessToken);
        }));

        const combinedRepos = allRepos.flat();

        res.json(combinedRepos);

    } catch (err) {
        console.error('Error fetching organizations:', err);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
};

const getRepositoriesForOrganization = async (org, accessToken) => {
    try {
        const response = await axios.get(`https://api.github.com/orgs/${org}/repos`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        return response.data;
    } catch (err) {
        console.error(`Failed to fetch repositories for organization ${org}:`, err);
        throw new Error(`Failed to fetch repositories for organization ${org}`);
    }
};

