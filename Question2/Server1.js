// Server.js - Social Media Analytics HTTP Microservice
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 9876;
const BASE_URL = 'http://20.244.56.144/evaluation-service';

// Middleware
app.use(cors());
app.use(express.json());

// Cache for storing data to reduce API calls
const cache = {
  users: null,
  usersLastFetched: null,
  posts: {},
  comments: {},
  topUsers: null,
  topUsersLastFetched: null,
  popularPosts: null,
  popularPostsLastFetched: null,
  latestPosts: null,
  latestPostsLastFetched: null
};

// Cache validity duration (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Helper to check if cache is valid
const isCacheValid = (lastFetched) => {
  return lastFetched && (Date.now() - lastFetched) < CACHE_DURATION;
};

// Helper to fetch all users
const fetchAllUsers = async () => {
  if (cache.users && isCacheValid(cache.usersLastFetched)) {
    return cache.users;
  }
  
  try {
    const response = await axios.get(`${BASE_URL}/users`);
    cache.users = response.data.users;
    cache.usersLastFetched = Date.now();
    return cache.users;
  } catch (error) {
    console.error('Error fetching users:', error.message);
    throw error;
  }
};

// Helper to fetch posts for a user
const fetchUserPosts = async (userId) => {
  if (cache.posts[userId] && isCacheValid(cache.posts[userId].lastFetched)) {
    return cache.posts[userId].data;
  }
  
  try {
    const response = await axios.get(`${BASE_URL}/users/${userId}/posts`);
    if (!cache.posts[userId]) {
      cache.posts[userId] = {};
    }
    cache.posts[userId].data = response.data.posts;
    cache.posts[userId].lastFetched = Date.now();
    return response.data.posts;
  } catch (error) {
    console.error(`Error fetching posts for user ${userId}:`, error.message);
    throw error;
  }
};

// Helper to fetch comments for a post
const fetchPostComments = async (postId) => {
  if (cache.comments[postId] && isCacheValid(cache.comments[postId].lastFetched)) {
    return cache.comments[postId].data;
  }
  
  try {
    const response = await axios.get(`${BASE_URL}/posts/${postId}/comments`);
    if (!cache.comments[postId]) {
      cache.comments[postId] = {};
    }
    cache.comments[postId].data = response.data.comments;
    cache.comments[postId].lastFetched = Date.now();
    return response.data.comments;
  } catch (error) {
    console.error(`Error fetching comments for post ${postId}:`, error.message);
    throw error;
  }
};

// API Endpoint: Get top users based on comment count
app.get('/api/users/top', async (req, res) => {
  try {
    if (cache.topUsers && isCacheValid(cache.topUsersLastFetched)) {
      return res.json({ users: cache.topUsers });
    }
    
    const users = await fetchAllUsers();
    const userCommentCounts = {};
    
    // For each user, fetch their posts and count comments
    for (const userId in users) {
      const posts = await fetchUserPosts(userId);
      let totalComments = 0;
      
      for (const post of posts) {
        const comments = await fetchPostComments(post.id);
        totalComments += comments.length;
      }
      
      userCommentCounts[userId] = {
        id: userId,
        name: users[userId],
        commentCount: totalComments
      };
    }
    
    // Sort users by comment count and get top 5
    const topUsers = Object.values(userCommentCounts)
      .sort((a, b) => b.commentCount - a.commentCount)
      .slice(0, 5);
      
    cache.topUsers = topUsers;
    cache.topUsersLastFetched = Date.now();
    
    res.json({ users: topUsers });
  } catch (error) {
    console.error('Error in /api/users/top:', error.message);
    res.status(500).json({ error: 'Failed to fetch top users' });
  }
});

// API Endpoint: Get posts by type (latest or popular)
app.get('/api/posts', async (req, res) => {
  try {
    const type = req.query.type || 'latest';
    
    if (type === 'popular' && cache.popularPosts && isCacheValid(cache.popularPostsLastFetched)) {
      return res.json({ posts: cache.popularPosts });
    }
    
    if (type === 'latest' && cache.latestPosts && isCacheValid(cache.latestPostsLastFetched)) {
      return res.json({ posts: cache.latestPosts });
    }
    
    const users = await fetchAllUsers();
    let allPosts = [];
    
    // Fetch all posts for all users
    for (const userId in users) {
      const userPosts = await fetchUserPosts(userId);
      
      // Fetch comment counts for each post
      const postsWithCommentCount = await Promise.all(userPosts.map(async post => {
        const comments = await fetchPostComments(post.id);
        return {
          ...post,
          commentCount: comments.length,
          userName: users[post.userid]
        };
      }));
      
      allPosts = [...allPosts, ...postsWithCommentCount];
    }
    
    let resultPosts;
    
    if (type === 'popular') {
      // Sort by comment count (highest first)
      resultPosts = allPosts.sort((a, b) => b.commentCount - a.commentCount);
      
      // If multiple posts have the same max comments, include all of them
      const maxComments = resultPosts[0]?.commentCount || 0;
      resultPosts = resultPosts.filter(post => post.commentCount === maxComments);
      
      cache.popularPosts = resultPosts;
      cache.popularPostsLastFetched = Date.now();
    } else {
      // Sort by post ID (assuming newer posts have higher IDs)
      resultPosts = allPosts.sort((a, b) => b.id - a.id).slice(0, 5);
      
      cache.latestPosts = resultPosts;
      cache.latestPostsLastFetched = Date.now();
    }
    
    res.json({ posts: resultPosts });
  } catch (error) {
    console.error(`Error in /api/posts?type=${req.query.type}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Root endpoint - API documentation
app.get('/', (req, res) => {
  res.json({
    message: 'Social Media Analytics API',
    endpoints: [
      {
        path: '/api/users/top',
        method: 'GET',
        description: 'Get top 5 users with the most commented posts'
      },
      {
        path: '/api/posts',
        method: 'GET',
        query: 'type (latest or popular)',
        description: 'Get posts by type. Popular shows posts with most comments, latest shows 5 newest posts'
      }
    ]
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; // For testing purposes