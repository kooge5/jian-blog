/**
 * 简 — GitHub Issues 存储模块
 * 功能：使用 GitHub Issues API 作为文章数据源
 * 作者：钱卫忠
 */

var GitHubStorage = (function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    owner: 'kooge5',           // GitHub 用户名
    repo: 'jian-blog',         // 仓库名
    tokenKey: 'jian_blog_token' // localStorage 中存储 Token 的键名
  };

  /* ---------- 私有方法 ---------- */

  /**
   * 获取 GitHub Token
   * @returns {string|null} Token 或 null
   */
  function getToken() {
    return localStorage.getItem(CONFIG.tokenKey);
  }

  /**
   * 设置 GitHub Token
   * @param {string} token - GitHub Personal Access Token
   */
  function setToken(token) {
    localStorage.setItem(CONFIG.tokenKey, token);
  }

  /**
   * 清除 GitHub Token
   */
  function clearToken() {
    localStorage.removeItem(CONFIG.tokenKey);
  }

  /**
   * 构建 API 请求头
   * @returns {Object} 请求头对象
   */
  function buildHeaders() {
    var headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
    var token = getToken();
    if (token) {
      headers['Authorization'] = 'token ' + token;
    }
    return headers;
  }

  /**
   * 发送 API 请求
   * @param {string} endpoint - API 端点（不含基础 URL）
   * @param {Object} options - fetch 选项
   * @returns {Promise<Object>} 响应数据
   */
  function apiRequest(endpoint, options) {
    options = options || {};
    options.headers = Object.assign({}, buildHeaders(), options.headers || {});

    var url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo + endpoint;

    return fetch(url, options).then(function (response) {
      if (!response.ok) {
        return response.json().then(function (err) {
          console.error('GitHub API 错误详情:', err);
          var errorMsg = err.message || 'API 请求失败: ' + response.status;
          if (err.errors && err.errors.length > 0) {
            errorMsg += ' - ' + err.errors.map(function(e) { return e.field + ': ' + e.message; }).join(', ');
          }
          throw new Error(errorMsg);
        });
      }
      return response.json();
    });
  }

  /* ---------- Issues 操作 ---------- */

  /**
   * 获取所有文章（Issues）
   * @param {Object} options - 筛选选项
   * @param {string} options.state - 状态：open/closed/all
   * @param {string} options.labels - 标签筛选
   * @returns {Promise<Array>} Issues 列表
   */
  function getPosts(options) {
    options = options || {};
    var params = [];
    if (options.state) params.push('state=' + options.state);
    if (options.labels) params.push('labels=' + encodeURIComponent(options.labels));
    params.push('sort=created');
    params.push('direction=desc');
    params.push('per_page=100');

    var query = params.length > 0 ? '?' + params.join('&') : '';
    return apiRequest('/issues' + query);
  }

  /**
   * 获取单篇文章（Issue）
   * @param {number} issueNumber - Issue 编号
   * @returns {Promise<Object>} Issue 详情
   */
  function getPostById(issueNumber) {
    return apiRequest('/issues/' + issueNumber);
  }

  /**
   * 创建文章（Issue）
   * @param {Object} post - 文章数据
   * @param {string} post.title - 标题
   * @param {string} post.body - 正文（Markdown）
   * @param {Array} post.labels - 标签数组
   * @returns {Promise<Object>} 创建的 Issue
   */
  function createPost(post) {
    if (!getToken()) {
      return Promise.reject(new Error('请先设置 GitHub Token'));
    }

    var requestBody = {
      title: post.title,
      body: post.body,
      labels: post.labels || []
    };

    console.log('GitHub API 请求:', {
      url: '/issues',
      method: 'POST',
      body: requestBody,
      bodyJSON: JSON.stringify(requestBody)
    });

    return apiRequest('/issues', {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
  }

  /**
   * 更新文章（Issue）
   * @param {number} issueNumber - Issue 编号
   * @param {Object} post - 文章数据
   * @returns {Promise<Object>} 更新后的 Issue
   */
  function updatePost(issueNumber, post) {
    if (!getToken()) {
      return Promise.reject(new Error('请先设置 GitHub Token'));
    }

    var body = {};
    if (post.title !== undefined) body.title = post.title;
    if (post.body !== undefined) body.body = post.body;
    if (post.labels !== undefined) body.labels = post.labels;
    if (post.state !== undefined) body.state = post.state;

    return apiRequest('/issues/' + issueNumber, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  }

  /**
   * 删除文章（关闭 Issue）
   * @param {number} issueNumber - Issue 编号
   * @returns {Promise<Object>} 关闭后的 Issue
   */
  function deletePost(issueNumber) {
    if (!getToken()) {
      return Promise.reject(new Error('请先设置 GitHub Token'));
    }

    return apiRequest('/issues/' + issueNumber, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' })
    });
  }

  /* ---------- 工具方法 ---------- */

  /**
   * 将 Issue 转换为文章对象
   * @param {Object} issue - GitHub Issue 对象
   * @returns {Object} 文章对象
   */
  function issueToPost(issue) {
    // 解析正文中的元数据（如果有）
    var body = issue.body || '';
    var subtitle = '';
    var content = body;

    // 尝试从正文第一行提取副标题（格式：> 副标题内容）
    var lines = body.split('\n');
    if (lines[0] && lines[0].startsWith('> ')) {
      subtitle = lines[0].substring(2).trim();
      content = lines.slice(1).join('\n').trim();
    }

    // 提取分类标签
    var category = '其他';
    var validCategories = ['生活', '思想', '情绪'];
    if (issue.labels) {
      for (var i = 0; i < issue.labels.length; i++) {
        if (validCategories.indexOf(issue.labels[i].name) !== -1) {
          category = issue.labels[i].name;
          break;
        }
      }
    }

    // 判断状态
    var status = 'draft';
    if (issue.labels) {
      for (var j = 0; j < issue.labels.length; j++) {
        if (issue.labels[j].name === '已发布') {
          status = 'published';
          break;
        }
      }
    }

    // 计算阅读时间
    var textContent = content.replace(/[#*`_\[\]()]/g, '');
    var readTime = Math.max(1, Math.ceil(textContent.length / 400));

    // 提取摘要
    var excerpt = subtitle || textContent.substring(0, 100) + (textContent.length > 100 ? '……' : '');

    // 格式化日期
    var date = new Date(issue.created_at);
    var dateStr = date.getFullYear() + ' · ' +
                  String(date.getMonth() + 1).padStart(2, '0') + ' · ' +
                  String(date.getDate()).padStart(2, '0');

    return {
      id: issue.number,
      title: issue.title,
      subtitle: subtitle,
      category: category,
      content: content,
      excerpt: excerpt,
      readTime: readTime,
      date: dateStr,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      status: status,
      url: issue.html_url,
      labels: issue.labels || []
    };
  }

  /**
   * 检查是否已配置 Token
   * @returns {boolean}
   */
  function isConfigured() {
    return !!getToken();
  }

  /**
   * 上传图片到 GitHub 图床
   * 使用 GitHub Contents API 上传图片到仓库的 assets 目录
   * @param {string} filename - 文件名
   * @param {string} base64Data - base64 编码的图片数据（不含 data:image 前缀）
   * @returns {Promise<string>} 图片的 GitHub 访问 URL
   */
  function uploadImage(filename, base64Data) {
    if (!getToken()) {
      return Promise.reject(new Error('请先设置 GitHub Token'));
    }

    // 生成唯一文件名
    var timestamp = Date.now();
    var uniqueName = timestamp + '_' + filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    var path = 'assets/images/' + uniqueName;

    // 上传图片到仓库
    return apiRequest('/contents/' + path, {
      method: 'PUT',
      body: JSON.stringify({
        message: '上传图片: ' + filename,
        content: base64Data
      })
    }).then(function (result) {
      // 返回原始内容 URL（通过 jsDelivr CDN 加速）
      if (result.content && result.content.download_url) {
        // 转换为 jsDelivr CDN 链接，速度更快
        return 'https://cdn.jsdelivr.net/gh/' + CONFIG.owner + '/' + CONFIG.repo + '@master/' + path;
      }
      throw new Error('上传成功但未获取到图片 URL');
    });
  }

  /**
   * 处理 Markdown 中的 base64 图片，上传到 GitHub 并替换为 URL
   * @param {string} markdown - 原始 Markdown 内容
   * @returns {Promise<string>} 处理后的 Markdown
   */
  function processMarkdownImages(markdown) {
    return new Promise(function (resolve) {
      // 匹配 base64 图片: ![alt](data:image/xxx;base64,xxxx)
      var base64ImageRegex = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
      var matches = [];
      var match;

      while ((match = base64ImageRegex.exec(markdown)) !== null) {
        matches.push({
          full: match[0],
          alt: match[1],
          ext: match[2],
          data: match[3]
        });
      }

      if (matches.length === 0) {
        resolve(markdown);
        return;
      }

      // 逐个上传图片
      var uploadPromises = matches.map(function (item) {
        var filename = 'image.' + item.ext;
        return uploadImage(filename, item.data).then(function (url) {
          return {
            original: item.full,
            replacement: '![' + item.alt + '](' + url + ')'
          };
        }).catch(function (error) {
          console.error('图片上传失败:', error);
          // 上传失败时保留原始 base64
          return {
            original: item.full,
            replacement: item.full
          };
        });
      });

      Promise.all(uploadPromises).then(function (results) {
        var processedMarkdown = markdown;
        results.forEach(function (result) {
          processedMarkdown = processedMarkdown.replace(result.original, result.replacement);
        });
        resolve(processedMarkdown);
      });
    });
  }

  /* ---------- 公开接口 ---------- */
  return {
    // Token 管理
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isConfigured: isConfigured,

    // 文章 CRUD
    getPosts: getPosts,
    getPostById: getPostById,
    createPost: createPost,
    updatePost: updatePost,
    deletePost: deletePost,

    // 图片处理
    uploadImage: uploadImage,
    processMarkdownImages: processMarkdownImages,

    // 工具方法
    issueToPost: issueToPost
  };

})();
