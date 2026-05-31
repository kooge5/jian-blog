/**
 * 简 — GitHub Issues 编辑器逻辑模块
 * 功能：Quill 编辑器初始化、封面图片管理、自动保存、发布到 GitHub Issues
 * 作者：钱卫忠
 */

(function () {
  'use strict';

  /* ---------- DOM 元素 ---------- */
  var tokenNotice = document.getElementById('tokenNotice');
  var editorForm = document.getElementById('editorForm');
  var pageTitle = document.getElementById('pageTitle');
  var coverUploadArea = document.getElementById('coverUpload');
  var coverFileInput = document.getElementById('coverFileInput');
  var coverPreview = document.getElementById('coverPreview');
  var coverPreviewImg = document.getElementById('coverPreviewImg');
  var coverPlaceholder = document.getElementById('coverPlaceholder');
  var coverRemoveBtn = document.getElementById('coverRemove');
  var titleInput = document.getElementById('editorTitle');
  var subtitleInput = document.getElementById('editorSubtitle');
  var categorySelect = document.getElementById('editorCategory');
  var quillEditor = document.getElementById('quillEditor');
  var imageFileInput = document.getElementById('imageFileInput');
  var imageUploadBtn = document.getElementById('imageUploadBtn');
  var draftBtn = document.getElementById('draftBtn');
  var publishBtn = document.getElementById('publishBtn');
  var toastEl = document.getElementById('editorToast');

  /* ---------- 状态变量 ---------- */
  var quill = null;              // Quill 编辑器实例
  var coverData = '';            // 封面图 Base64 数据
  var autoSaveTimer = null;      // 自动保存定时器
  var AUTO_SAVE_INTERVAL = 30000; // 自动保存间隔：30 秒
  var currentEditId = null;      // 当前编辑的文章 ID
  var isLoading = false;         // 是否正在加载

  /* ---------- 初始化 ---------- */

  /**
   * 页面加载完成后初始化
   */
  function init() {
    // 检查 Token 配置
    checkTokenStatus();

    // 初始化编辑器
    initQuill();

    // 恢复草稿或加载编辑文章
    restoreContent();

    // 绑定事件
    bindEvents();
  }

  /**
   * 检查 Token 配置状态
   */
  function checkTokenStatus() {
    if (!GitHubStorage.isConfigured()) {
      tokenNotice.style.display = 'block';
      editorForm.style.opacity = '0.5';
      editorForm.style.pointerEvents = 'none';
      draftBtn.disabled = true;
      publishBtn.disabled = true;
      return false;
    }
    tokenNotice.style.display = 'none';
    editorForm.style.opacity = '1';
    editorForm.style.pointerEvents = 'auto';
    draftBtn.disabled = false;
    publishBtn.disabled = false;
    return true;
  }

  /* ---------- Quill 编辑器初始化 ---------- */

  /**
   * 初始化 Quill 富文本编辑器
   */
  function initQuill() {
    quill = new Quill(quillEditor, {
      theme: 'snow',
      placeholder: '在这里开始书写……',
      modules: {
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],   // 标题
          ['bold', 'italic', 'underline', 'strike'], // 文字格式
          ['blockquote', 'code-block'],          // 引用、代码块
          [{ 'list': 'ordered' }, { 'list': 'bullet' }], // 列表
          [{ 'align': [] }],                     // 对齐
          ['link', 'image'],                     // 链接、图片
          ['clean']                              // 清除格式
        ]
      }
    });

    // 监听内容变化，触发自动保存
    quill.on('text-change', function () {
      scheduleAutoSave();
    });
  }

  /* ---------- 事件绑定 ---------- */

  /**
   * 绑定所有事件处理器
   */
  function bindEvents() {
    // 封面图片上传
    coverUploadArea.addEventListener('click', function (e) {
      if (e.target.closest('.cover-remove')) return;
      if (!GitHubStorage.isConfigured()) {
        showToast('请先配置 GitHub Token');
        return;
      }
      coverFileInput.click();
    });

    coverFileInput.addEventListener('change', handleCoverUpload);
    coverRemoveBtn.addEventListener('click', handleCoverRemove);

    // 编辑器内图片上传
    imageUploadBtn.addEventListener('click', function () {
      if (!GitHubStorage.isConfigured()) {
        showToast('请先配置 GitHub Token');
        return;
      }
      imageFileInput.click();
    });
    imageFileInput.addEventListener('change', handleImageUpload);

    // 保存和发布按钮
    draftBtn.addEventListener('click', handleSaveDraft);
    publishBtn.addEventListener('click', handlePublish);

    // 输入框变化触发自动保存
    titleInput.addEventListener('input', scheduleAutoSave);
    subtitleInput.addEventListener('input', scheduleAutoSave);
    categorySelect.addEventListener('change', scheduleAutoSave);

    // 页面离开提示
    window.addEventListener('beforeunload', handleBeforeUnload);
  }

  /* ---------- 封面图片管理 ---------- */

  /**
   * 处理封面图片上传
   */
  function handleCoverUpload() {
    var file = this.files && this.files[0];
    if (!file) return;

    // 校验文件类型
    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
      showToast('请选择 JPG、PNG、GIF 或 WebP 格式的图片');
      return;
    }

    // 校验文件大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      showToast('封面图片不能超过 5MB');
      return;
    }

    // 读取并预览
    fileToBase64(file).then(function (base64) {
      coverData = base64;
      coverPreviewImg.src = base64;
      coverPreview.classList.add('active');
      coverPlaceholder.classList.add('hidden');
      coverUploadArea.classList.add('has-image');
      scheduleAutoSave();
    }).catch(function () {
      showToast('封面图片读取失败');
    });

    // 重置 input，允许重复选择同一文件
    this.value = '';
  }

  /**
   * 删除封面图片
   * @param {Event} e - 点击事件
   */
  function handleCoverRemove(e) {
    e.stopPropagation();
    coverData = '';
    coverPreviewImg.src = '';
    coverPreview.classList.remove('active');
    coverPlaceholder.classList.remove('hidden');
    coverUploadArea.classList.remove('has-image');
    scheduleAutoSave();
  }

  /* ---------- 编辑器内图片上传 ---------- */

  /**
   * 处理编辑器内图片文件选择
   */
  function handleImageUpload() {
    var file = this.files && this.files[0];
    if (!file) return;

    // 校验文件类型
    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
      showToast('请选择 JPG、PNG、GIF 或 WebP 格式的图片');
      return;
    }

    // 校验文件大小（最大 10MB）
    if (file.size > 10 * 1024 * 1024) {
      showToast('图片不能超过 10MB');
      return;
    }

    // 读取并插入编辑器
    fileToBase64(file).then(function (base64) {
      var range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'image', base64);
      quill.setSelection(range.index + 1);
    }).catch(function () {
      showToast('图片读取失败');
    });

    // 重置 input
    this.value = '';
  }

  /* ---------- 自动保存 ---------- */

  /**
   * 调度自动保存（防抖）
   */
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      performAutoSave();
    }, AUTO_SAVE_INTERVAL);
  }

  /**
   * 执行自动保存到 localStorage
   */
  function performAutoSave() {
    if (!GitHubStorage.isConfigured()) return;

    var draftData = collectFormData();
    if (!draftData.title && !draftData.content) return; // 空内容不保存

    // 保存到 localStorage
    localStorage.setItem('jian_blog_draft', JSON.stringify(draftData));
    showToast('草稿已自动保存', 1500);
  }

  /* ---------- 保存与发布 ---------- */

  /**
   * 收集表单数据
   * @returns {Object} 表单数据对象
   */
  function collectFormData() {
    return {
      title: titleInput.value.trim(),
      subtitle: subtitleInput.value.trim(),
      category: categorySelect.value,
      content: quill ? quill.root.innerHTML : '',
      cover: coverData
    };
  }

  /**
   * 将 HTML 内容转换为 Markdown
   * @param {string} html - HTML 内容
   * @returns {string} Markdown 文本
   */
  function htmlToMarkdown(html) {
    if (!html) return '';

    var markdown = html;

    // 移除空的段落
    markdown = markdown.replace(/<p><br><\/p>/g, '');
    markdown = markdown.replace(/<p><\/p>/g, '');

    // 处理标题
    markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');

    // 处理粗体和斜体
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*');

    // 处理引用
    markdown = markdown.replace(/<blockquote>(.*?)<\/blockquote>/gi, function (match, content) {
      return '> ' + content.replace(/<p>/g, '').replace(/<\/p>/g, '\n> ').trim() + '\n\n';
    });

    // 处理代码块
    markdown = markdown.replace(/<pre><code>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n');
    markdown = markdown.replace(/<code>(.*?)<\/code>/gi, '`$1`');

    // 处理链接
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // 处理图片
    markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
    markdown = markdown.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)');
    markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)');

    // 处理无序列表
    markdown = markdown.replace(/<ul>(.*?)<\/ul>/gis, function (match, content) {
      return content.replace(/<li>(.*?)<\/li>/gi, '- $1\n') + '\n';
    });

    // 处理有序列表
    markdown = markdown.replace(/<ol>(.*?)<\/ol>/gis, function (match, content) {
      var index = 1;
      return content.replace(/<li>(.*?)<\/li>/gi, function (match, item) {
        return (index++) + '. ' + item + '\n';
      }) + '\n';
    });

    // 处理段落
    markdown = markdown.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');

    // 处理换行
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

    // 处理水平线
    markdown = markdown.replace(/<hr\s*\/?>/gi, '---\n\n');

    // 清理多余的空白
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();

    return markdown;
  }

  /**
   * 构建 Issue body
   * @param {Object} data - 表单数据
   * @returns {string} Markdown 格式的 body
   */
  function buildIssueBody(data) {
    var body = '';

    // 如果有副标题，放在引用块中
    if (data.subtitle) {
      body += '> ' + data.subtitle + '\n\n';
    }

    // 封面图片（如果有）
    if (data.cover) {
      body += '![封面](' + data.cover + ')\n\n';
    }

    // 正文内容
    var markdownContent = htmlToMarkdown(data.content);
    body += markdownContent;

    // 确保 body 不为空（GitHub API 要求）
    if (!body || body.trim() === '') {
      body = '（暂无内容）';
    }

    return body;
  }

  /**
   * 获取标签数组
   * @param {Object} data - 表单数据
   * @param {string} status - 状态：draft/published
   * @returns {Array} 标签数组
   */
  function getLabels(data, status) {
    var labels = [];

    // 添加分类标签（必须是仓库中存在的标签）
    var validCategories = ['生活', '思想', '情绪'];
    if (data.category && validCategories.indexOf(data.category) !== -1) {
      labels.push(data.category);
    }

    // 添加状态标签
    if (status === 'published') {
      labels.push('已发布');
    } else {
      labels.push('草稿');
    }

    return labels;
  }

  /**
   * 校验表单数据
   * @param {Object} data - 表单数据
   * @returns {string|null} 错误信息，null 表示校验通过
   */
  function validateForm(data) {
    if (!data.title) {
      return '请输入文章标题';
    }
    if (!data.content || data.content === '<p><br></p>' || data.content === '<p></p>') {
      return '请输入文章内容';
    }
    return null;
  }

  /**
   * 保存草稿按钮点击处理
   */
  function handleSaveDraft() {
    if (!GitHubStorage.isConfigured()) {
      showToast('请先配置 GitHub Token');
      return;
    }

    var data = collectFormData();

    // 校验
    var error = validateForm(data);
    if (error) {
      showToast(error);
      return;
    }

    isLoading = true;
    draftBtn.disabled = true;
    draftBtn.textContent = '保存中...';

    var body = buildIssueBody(data);
    var labels = getLabels(data, 'draft');

    // 如果有编辑 ID，则更新；否则创建
    var promise;
    if (currentEditId) {
      promise = GitHubStorage.updatePost(parseInt(currentEditId), {
        title: data.title,
        body: body,
        labels: labels
      });
    } else {
      promise = GitHubStorage.createPost({
        title: data.title,
        body: body,
        labels: labels
      });
    }

    promise
      .then(function (issue) {
        currentEditId = issue.number;
        showToast('草稿已保存');
        // 清除本地草稿
        localStorage.removeItem('jian_blog_draft');
      })
      .catch(function (error) {
        console.error('保存草稿失败:', error);
        showToast('保存失败：' + error.message);
      })
      .finally(function () {
        isLoading = false;
        draftBtn.disabled = false;
        draftBtn.textContent = '保存草稿';
      });
  }

  /**
   * 发布文章按钮点击处理
   */
  function handlePublish() {
    if (!GitHubStorage.isConfigured()) {
      showToast('请先配置 GitHub Token');
      return;
    }

    var data = collectFormData();

    // 校验
    var error = validateForm(data);
    if (error) {
      showToast(error);
      return;
    }

    isLoading = true;
    publishBtn.disabled = true;
    publishBtn.textContent = '处理图片并发布中...';
    draftBtn.disabled = true;

    var body = buildIssueBody(data);
    var labels = getLabels(data, 'published');

    // 处理 Markdown 中的 base64 图片，上传到 GitHub 图床
    GitHubStorage.processMarkdownImages(body).then(function (processedBody) {
      // 检查处理后的 body 长度
      if (processedBody.length > 60000) {
        showToast('文章内容太长（包含图片），请减少图片数量或压缩图片');
        isLoading = false;
        publishBtn.disabled = false;
        publishBtn.textContent = '发布文章';
        draftBtn.disabled = false;
        return;
      }

      // 如果有编辑 ID，则更新；否则创建
      var promise;
      if (currentEditId) {
        promise = GitHubStorage.updatePost(parseInt(currentEditId), {
          title: data.title,
          body: processedBody,
          labels: labels
        });
      } else {
        promise = GitHubStorage.createPost({
          title: data.title,
          body: processedBody,
          labels: labels
        });
      }

      return promise;
    }).then(function (issue) {
      if (!issue) return; // 上面已经处理了错误
      showToast('文章发布成功');
      // 清除本地草稿
      localStorage.removeItem('jian_blog_draft');
      // 延迟跳转到文章页
      setTimeout(function () {
        window.location.href = 'post.html?id=' + issue.number;
      }, 1200);
    }).catch(function (error) {
      console.error('发布文章失败:', error);
      showToast('发布失败：' + error.message);
      isLoading = false;
      publishBtn.disabled = false;
      publishBtn.textContent = '发布文章';
      draftBtn.disabled = false;
    });
  }

  /* ---------- 草稿恢复 ---------- */

  /**
   * 页面加载时恢复草稿或加载编辑文章
   */
  function restoreContent() {
    // 优先检查 URL 参数 edit（编辑已有文章）
    var editId = getUrlParam('edit');
    if (editId && GitHubStorage.isConfigured()) {
      loadArticleForEdit(editId);
      return;
    }

    // 恢复未发布的本地草稿
    var draftJson = localStorage.getItem('jian_blog_draft');
    if (draftJson) {
      try {
        var draft = JSON.parse(draftJson);
        fillFormData(draft);
        showToast('已恢复上次编辑的草稿');
      } catch (e) {
        console.error('恢复草稿失败:', e);
      }
    }
  }

  /**
   * 加载文章进行编辑
   * @param {string} id - 文章 ID
   */
  function loadArticleForEdit(id) {
    isLoading = true;
    pageTitle.textContent = '编辑文章';
    document.title = '编辑文章 — 简';

    GitHubStorage.getPostById(parseInt(id))
      .then(function (issue) {
        var post = GitHubStorage.issueToPost(issue);
        currentEditId = post.id;

        // 填充表单
        titleInput.value = post.title || '';
        subtitleInput.value = post.subtitle || '';
        categorySelect.value = post.category || '其他';

        // 将 Markdown 内容转换为 HTML 并设置到编辑器
        if (quill) {
          var htmlContent = markdownToHtml(post.content);
          quill.root.innerHTML = htmlContent;
        }

        // 恢复封面（从正文中提取）
        if (post.content) {
          var imgMatch = post.content.match(/!\[封面\]\((.*?)\)/);
          if (imgMatch && imgMatch[1].startsWith('data:')) {
            coverData = imgMatch[1];
            coverPreviewImg.src = coverData;
            coverPreview.classList.add('active');
            coverPlaceholder.classList.add('hidden');
            coverUploadArea.classList.add('has-image');
          }
        }

        showToast('已加载文章，正在编辑');
      })
      .catch(function (error) {
        console.error('加载文章失败:', error);
        showToast('加载文章失败：' + error.message);
        pageTitle.textContent = '写文章';
        document.title = '写文章 — 简';
      })
      .finally(function () {
        isLoading = false;
      });
  }

  /**
   * 填充表单数据
   * @param {Object} data - 数据对象
   */
  function fillFormData(data) {
    titleInput.value = data.title || '';
    subtitleInput.value = data.subtitle || '';
    categorySelect.value = data.category || '其他';
    if (quill && data.content) {
      quill.root.innerHTML = data.content;
    }

    // 恢复封面
    if (data.cover) {
      coverData = data.cover;
      coverPreviewImg.src = data.cover;
      coverPreview.classList.add('active');
      coverPlaceholder.classList.add('hidden');
      coverUploadArea.classList.add('has-image');
    }
  }

  /* ---------- 工具方法 ---------- */

  /**
   * 将 Markdown 转换为 HTML
   * @param {string} markdown - Markdown 文本
   * @returns {string} HTML
   */
  function markdownToHtml(markdown) {
    if (!markdown) return '<p></p>';

    var html = markdown;

    // 处理标题
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 处理粗体和斜体
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 处理引用
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // 处理代码块
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 处理链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 处理图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;">');

    // 处理无序列表
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // 处理有序列表
    html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

    // 处理水平线
    html = html.replace(/^---$/gim, '<hr>');

    // 处理段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // 清理多余的段落标签
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>.*?<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>.*?<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>.*?<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>.*?<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p><hr><\/p>/g, '<hr>');

    return html;
  }

  /**
   * 文件转 Base64
   * @param {File} file - 文件对象
   * @returns {Promise<string>} Base64 字符串
   */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('文件读取失败'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * 显示 Toast 提示消息
   * @param {string} message - 提示文本
   * @param {number} duration - 显示时长（毫秒），默认 2000
   */
  function showToast(message, duration) {
    duration = duration || 2000;
    toastEl.textContent = message;
    toastEl.classList.add('show');

    setTimeout(function () {
      toastEl.classList.remove('show');
    }, duration);
  }

  /**
   * 获取 URL 查询参数
   * @param {string} name - 参数名
   * @returns {string|null} 参数值
   */
  function getUrlParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  /**
   * 页面离开前提示
   * @param {BeforeUnloadEvent} e - 事件对象
   */
  function handleBeforeUnload(e) {
    var data = collectFormData();
    if (data.title || (data.content && data.content !== '<p><br></p>' && data.content !== '<p></p>')) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  /* ---------- 启动 ---------- */

  // DOM 就绪后执行初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
