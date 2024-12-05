const passport = require('passport');
const strategy = process.env.SESSION_SECRET
const axios = require('axios');

const User = require('../models/githubIntegration');
const express = require("express");  // MongoDB model

// Check the GitHub connection status
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

// Handle GitHub authentication redirect
exports.authGitHub = passport.authenticate('github', { scope: ['user', 'repo'] });

// GitHub callback to handle success/failure
exports.githubCallback = (req, res) => {
    res.redirect('http://localhost:4200');
};

exports.getRepoDetails = async(req, res)=> {
    const { org, repo } = req.params;

    try {
        const commitsResponse = await axios.get(`https://api.github.com/repos/${org}/${repo}/commits`, {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            }
        });

        // Fetch pull requests
        const pullsResponse = await axios.get(`https://api.github.com/repos/${org}/${repo}/pulls`, {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            }
        });

        // Fetch issues
        const issuesResponse = await axios.get(`https://api.github.com/repos/${org}/${repo}/issues`, {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            }
        });








        const commits = commitsResponse.data.map((commit) => ({
            author: commit.commit.author.name,
        }));

        const pullRequests = pullsResponse.data.map((pr) => ({
            user: pr.user.login,
        }));

        const issues = issuesResponse.data.map((issue) => ({
            user: issue.user.login,
        }));

        // Aggregate user stats
        const userStats = {};

        // Process commits
        commits.forEach((commit) => {
            const user = commit.author || 'Unknown';
            if (!userStats[user]) {
                userStats[user] = { commits: 0, pullRequests: 0, issues: 0 };
            }
            userStats[user].commits++;
        });

        // Process pull requests
        pullRequests.forEach((pr) => {
            const user = pr.user || 'Unknown';
            if (!userStats[user]) {
                userStats[user] = { commits: 0, pullRequests: 0, issues: 0 };
            }
            userStats[user].pullRequests++;
        });

        // Process issues
        issues.forEach((issue) => {
            const user = issue.user || 'Unknown';
            if (!userStats[user]) {
                userStats[user] = { commits: 0, pullRequests: 0, issues: 0 };
            }
            userStats[user].issues++;
        });

        res.json({
            commits,
            pullRequests,
            issues,
            userStats,
        });
    } catch (error) {
        console.error('Error fetching repository details:', error.message);
        res.status(500).json({ error: 'Failed to fetch repository details' });
    }
}
// Disconnect GitHub integration
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

// controllers/githubController.js

// Fetch the organizations associated with the authenticated GitHub user
exports.getOrganizationsRepos = async (req, res) => {
    console.log('Fetching organizations...');

    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    try {

        // Fetch organizations from GitHub
        const response = await axios.get('https://api.github.com/user/orgs', {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            }
        });

        const organizations = response.data;

        // Now, fetch repositories for each organization
        const allRepos = await Promise.all(organizations.map(async (org) => {
            return getRepositoriesForOrganization(org.login, req.user.accessToken);
        }));

        // Combine the repositories for all organizations into one array
        const combinedRepos = allRepos.flat();

        res.json(combinedRepos);

    } catch (err) {
        console.error('Error fetching organizations:', err);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
};

// Fetch all repositories for a given organization
const getRepositoriesForOrganization = async (org, accessToken) => {
    try {
        const response = await axios.get(`https://api.github.com/orgs/${org}/repos`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        return response.data; // Return repositories for this organization
    } catch (err) {
        console.error(`Failed to fetch repositories for organization ${org}:`, err);
        throw new Error(`Failed to fetch repositories for organization ${org}`);
    }
};

