/**
 * 简 — 文章存储管理模块
 * 功能：文章的增删改查、草稿保存、本地存储管理
 * 作者：钱卫忠
 */

var Storage = (function () {
  'use strict';

  /* ---------- 常量 ---------- */
  var STORAGE_KEY = 'jian_blog_posts';       // 文章列表存储键
  var DRAFT_KEY = 'jian_blog_draft';         // 当前草稿存储键
  var ATTACHMENT_PREFIX = 'jian_attachment_'; // 附件存储前缀

  /* ---------- 工具方法 ---------- */

  /**
   * 生成唯一 ID
   * @returns {string} 唯一标识符
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 格式化日期为 YYYY · MM · DD
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的日期字符串
   */
  function formatDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + ' \u00B7 ' + m + ' \u00B7 ' + d;
  }

  /**
   * 估算阅读时间（按中文约 400 字/分钟）
   * @param {string} content - 文章纯文本内容
   * @returns {number} 预估阅读分钟数
   */
  function estimateReadTime(content) {
    // 去除 HTML 标签，计算纯文本字数
    var text = content.replace(/<[^>]*>/g, '').replace(/\s/g, '');
    var charCount = text.length;
    var minutes = Math.max(1, Math.ceil(charCount / 400));
    return minutes;
  }

  /**
   * 将文件转为 Base64 DataURL
   * @param {File} file - 文件对象
   * @returns {Promise<string>} Base64 DataURL
   */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('文件读取失败')); };
      reader.readAsDataURL(file);
    });
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小字符串
   */
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ---------- 核心存储操作 ---------- */

  /**
   * 获取所有文章列表
   * @returns {Array} 文章数组
   */
  function getPosts() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('读取文章列表失败：', e);
      return [];
    }
  }

  /**
   * 保存文章列表
   * @param {Array} posts - 文章数组
   * @returns {boolean} 是否保存成功
   */
  function savePosts(posts) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
      return true;
    } catch (e) {
      console.error('保存文章列表失败：', e);
      return false;
    }
  }

  /**
   * 根据 ID 获取单篇文章
   * @param {string} id - 文章 ID
   * @returns {Object|null} 文章对象或 null
   */
  function getPostById(id) {
    var posts = getPosts();
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].id === id) return posts[i];
    }
    return null;
  }

  /* ---------- 文章 CRUD ---------- */

  /**
   * 保存文章（新增或更新）
   * @param {Object} article - 文章数据
   * @param {string} article.id - 文章 ID（可选，不传则新建）
   * @param {string} article.title - 文章标题
   * @param {string} article.subtitle - 文章副标题
   * @param {string} article.category - 文章分类
   * @param {string} article.content - 文章 HTML 内容
   * @param {string} article.cover - 封面图 Base64（可选）
   * @param {Array} article.attachments - 附件列表（可选）
   * @param {string} article.status - 状态：draft 或 published
   * @returns {Object} 保存后的文章对象（含 id、date 等）
   */
  function saveArticle(article) {
    var posts = getPosts();
    var now = new Date();
    var isUpdate = !!article.id;

    if (isUpdate) {
      // 更新已有文章
      for (var i = 0; i < posts.length; i++) {
        if (posts[i].id === article.id) {
          posts[i].title = article.title || '';
          posts[i].subtitle = article.subtitle || '';
          posts[i].category = article.category || '其他';
          posts[i].content = article.content || '';
          posts[i].cover = article.cover || '';
          posts[i].attachments = article.attachments || [];
          posts[i].status = article.status || 'draft';
          posts[i].updatedAt = now.toISOString();
          posts[i].readTime = estimateReadTime(article.content || '');
          savePosts(posts);
          clearDraft();
          return posts[i];
        }
      }
    }

    // 新建文章
    var newArticle = {
      id: generateId(),
      title: article.title || '',
      subtitle: article.subtitle || '',
      category: article.category || '其他',
      content: article.content || '',
      cover: article.cover || '',
      attachments: article.attachments || [],
      status: article.status || 'draft',
      date: formatDate(now),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      readTime: estimateReadTime(article.content || '')
    };

    posts.unshift(newArticle);
    savePosts(posts);
    clearDraft();
    return newArticle;
  }

  /**
   * 删除文章
   * @param {string} id - 文章 ID
   * @returns {boolean} 是否删除成功
   */
  function deleteArticle(id) {
    var posts = getPosts();
    var filtered = posts.filter(function (p) { return p.id !== id; });
    if (filtered.length < posts.length) {
      savePosts(filtered);
      return true;
    }
    return false;
  }

  /* ---------- 草稿管理 ---------- */

  /**
   * 保存草稿到本地存储（自动保存用）
   * @param {Object} draftData - 草稿数据
   * @returns {boolean} 是否保存成功
   */
  function saveDraft(draftData) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
      return true;
    } catch (e) {
      console.error('保存草稿失败：', e);
      return false;
    }
  }

  /**
   * 获取当前草稿
   * @returns {Object|null} 草稿数据或 null
   */
  function getDraft() {
    try {
      var data = localStorage.getItem(DRAFT_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 清除草稿
   * @returns {boolean} 是否清除成功
   */
  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 附件管理 ---------- */

  /**
   * 保存附件到本地存储
   * @param {string} id - 附件 ID
   * @param {Object} attachment - 附件数据（含 name, size, type, data）
   * @returns {boolean} 是否保存成功
   */
  function saveAttachment(id, attachment) {
    try {
      localStorage.setItem(ATTACHMENT_PREFIX + id, JSON.stringify(attachment));
      return true;
    } catch (e) {
      console.error('保存附件失败：', e);
      return false;
    }
  }

  /**
   * 获取附件
   * @param {string} id - 附件 ID
   * @returns {Object|null} 附件数据或 null
   */
  function getAttachment(id) {
    try {
      var data = localStorage.getItem(ATTACHMENT_PREFIX + id);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 删除附件
   * @param {string} id - 附件 ID
   * @returns {boolean} 是否删除成功
   */
  function removeAttachment(id) {
    try {
      localStorage.removeItem(ATTACHMENT_PREFIX + id);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 公开接口 ---------- */
  return {
    generateId: generateId,
    formatDate: formatDate,
    estimateReadTime: estimateReadTime,
    fileToBase64: fileToBase64,
    formatFileSize: formatFileSize,
    getPosts: getPosts,
    getPostById: getPostById,
    saveArticle: saveArticle,
    deleteArticle: deleteArticle,
    saveDraft: saveDraft,
    getDraft: getDraft,
    clearDraft: clearDraft,
    saveAttachment: saveAttachment,
    getAttachment: getAttachment,
    removeAttachment: removeAttachment
  };

})();
