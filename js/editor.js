/**
 * 简 — 编辑器逻辑模块
 * 功能：Quill 编辑器初始化、封面图片管理、附件管理、自动保存、发布
 * 作者：钱卫忠
 */

(function () {
  'use strict';

  /* ---------- DOM 元素 ---------- */
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
  var attachmentFileInput = document.getElementById('attachmentFileInput');
  var attachmentAddBtn = document.getElementById('attachmentAddBtn');
  var attachmentList = document.getElementById('attachmentList');
  var attachmentEmpty = document.getElementById('attachmentEmpty');
  var draftBtn = document.getElementById('draftBtn');
  var publishBtn = document.getElementById('publishBtn');
  var toastEl = document.getElementById('editorToast');

  /* ---------- 状态变量 ---------- */
  var quill = null;              // Quill 编辑器实例
  var coverData = '';            // 封面图 Base64 数据
  var attachments = [];          // 附件列表 [{id, name, size, type}]
  var autoSaveTimer = null;      // 自动保存定时器
  var AUTO_SAVE_INTERVAL = 30000; // 自动保存间隔：30 秒

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

  /* ---------- 封面图片管理 ---------- */

  /**
   * 处理封面图片上传区域点击
   */
  coverUploadArea.addEventListener('click', function (e) {
    // 避免点击删除按钮时触发上传
    if (e.target.closest('.cover-remove')) return;
    coverFileInput.click();
  });

  /**
   * 处理封面图片文件选择
   */
  coverFileInput.addEventListener('change', function () {
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
    Storage.fileToBase64(file).then(function (base64) {
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
  });

  /**
   * 删除封面图片
   */
  coverRemoveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    coverData = '';
    coverPreviewImg.src = '';
    coverPreview.classList.remove('active');
    coverPlaceholder.classList.remove('hidden');
    coverUploadArea.classList.remove('has-image');
    scheduleAutoSave();
  });

  /* ---------- 编辑器内图片上传 ---------- */

  /**
   * 点击图片上传按钮
   */
  imageUploadBtn.addEventListener('click', function () {
    imageFileInput.click();
  });

  /**
   * 处理编辑器内图片文件选择
   */
  imageFileInput.addEventListener('change', function () {
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
    Storage.fileToBase64(file).then(function (base64) {
      var range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'image', base64);
      quill.setSelection(range.index + 1);
    }).catch(function () {
      showToast('图片读取失败');
    });

    // 重置 input
    this.value = '';
  });

  /* ---------- 附件管理 ---------- */

  /**
   * 点击添加附件按钮
   */
  attachmentAddBtn.addEventListener('click', function () {
    attachmentFileInput.click();
  });

  /**
   * 处理附件文件选择（支持多文件）
   */
  attachmentFileInput.addEventListener('change', function () {
    var files = this.files;
    if (!files || files.length === 0) return;

    for (var i = 0; i < files.length; i++) {
      addAttachment(files[i]);
    }

    // 重置 input
    this.value = '';
  });

  /**
   * 添加单个附件
   * @param {File} file - 文件对象
   */
  function addAttachment(file) {
    var id = Storage.generateId();
    var attachment = {
      id: id,
      name: file.name,
      size: file.size,
      type: file.type
    };

    // 保存附件数据到 localStorage
    Storage.fileToBase64(file).then(function (base64) {
      Storage.saveAttachment(id, {
        name: file.name,
        size: file.size,
        type: file.type,
        data: base64
      });
    }).catch(function () {
      showToast('附件 "' + file.name + '" 读取失败');
    });

    attachments.push(attachment);
    renderAttachmentList();
    scheduleAutoSave();
  }

  /**
   * 移除附件
   * @param {string} id - 附件 ID
   */
  function removeAttachment(id) {
    attachments = attachments.filter(function (a) { return a.id !== id; });
    Storage.removeAttachment(id);
    renderAttachmentList();
    scheduleAutoSave();
  }

  /**
   * 渲染附件列表
   */
  function renderAttachmentList() {
    attachmentList.innerHTML = '';

    if (attachments.length === 0) {
      attachmentEmpty.style.display = 'block';
      return;
    }

    attachmentEmpty.style.display = 'none';

    attachments.forEach(function (att) {
      var li = document.createElement('li');
      li.className = 'attachment-item';

      // 文件图标 SVG
      var iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/>' +
        '</svg>';

      li.innerHTML =
        '<span class="attachment-item-name">' +
          iconSvg +
          '<span>' + escapeHtml(att.name) + '</span>' +
          '<span class="attachment-item-size">' + Storage.formatFileSize(att.size) + '</span>' +
        '</span>' +
        '<button class="attachment-item-remove" data-id="' + att.id + '" title="移除附件">&times;</button>';

      // 绑定删除事件
      li.querySelector('.attachment-item-remove').addEventListener('click', function () {
        removeAttachment(this.getAttribute('data-id'));
      });

      attachmentList.appendChild(li);
    });
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
   * 执行自动保存
   */
  function performAutoSave() {
    var draftData = collectFormData();
    if (!draftData.title && !draftData.content) return; // 空内容不保存

    var result = Storage.saveDraft(draftData);
    if (result) {
      showToast('草稿已自动保存');
    }
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
      cover: coverData,
      attachments: attachments.map(function (a) {
        return { id: a.id, name: a.name, size: a.size, type: a.type };
      })
    };
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
    if (!data.content || data.content === '<p><br></p>') {
      return '请输入文章内容';
    }
    return null;
  }

  /**
   * 保存草稿按钮点击
   */
  draftBtn.addEventListener('click', function () {
    var data = collectFormData();
    var result = Storage.saveDraft(data);
    if (result) {
      showToast('草稿已保存');
    } else {
      showToast('草稿保存失败，请检查浏览器存储空间');
    }
  });

  /**
   * 发布文章按钮点击
   */
  publishBtn.addEventListener('click', function () {
    var data = collectFormData();

    // 校验
    var error = validateForm(data);
    if (error) {
      showToast(error);
      return;
    }

    // 检查是否有编辑中的文章 ID（URL 参数）
    var editId = getUrlParam('edit');
    if (editId) {
      data.id = editId;
    }

    data.status = 'published';

    // 保存文章
    var article = Storage.saveArticle(data);
    if (article) {
      showToast('文章发布成功');
      // 延迟跳转到文章页
      setTimeout(function () {
        window.location.href = 'post.html?id=' + article.id;
      }, 1200);
    } else {
      showToast('发布失败，请检查浏览器存储空间');
    }
  });

  /* ---------- 草稿恢复 ---------- */

  /**
   * 页面加载时恢复草稿
   */
  function restoreDraft() {
    // 优先检查 URL 参数 edit（编辑已有文章）
    var editId = getUrlParam('edit');
    if (editId) {
      var article = Storage.getPostById(editId);
      if (article) {
        titleInput.value = article.title || '';
        subtitleInput.value = article.subtitle || '';
        categorySelect.value = article.category || '其他';
        if (quill) quill.root.innerHTML = article.content || '';

        // 恢复封面
        if (article.cover) {
          coverData = article.cover;
          coverPreviewImg.src = article.cover;
          coverPreview.classList.add('active');
          coverPlaceholder.classList.add('hidden');
          coverUploadArea.classList.add('has-image');
        }

        // 恢复附件
        if (article.attachments && article.attachments.length > 0) {
          attachments = article.attachments.slice();
          renderAttachmentList();
        }

        // 更新页面标题
        document.title = '编辑文章 — 简';
        return;
      }
    }

    // 恢复未发布的草稿
    var draft = Storage.getDraft();
    if (!draft) return;

    titleInput.value = draft.title || '';
    subtitleInput.value = draft.subtitle || '';
    categorySelect.value = draft.category || '其他';
    if (quill && draft.content) quill.root.innerHTML = draft.content;

    // 恢复封面
    if (draft.cover) {
      coverData = draft.cover;
      coverPreviewImg.src = draft.cover;
      coverPreview.classList.add('active');
      coverPlaceholder.classList.add('hidden');
      coverUploadArea.classList.add('has-image');
    }

    // 恢复附件
    if (draft.attachments && draft.attachments.length > 0) {
      attachments = draft.attachments.slice();
      renderAttachmentList();
    }

    showToast('已恢复上次编辑的草稿');
  }

  /* ---------- 工具方法 ---------- */

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
   * HTML 转义，防止 XSS
   * @param {string} str - 原始字符串
   * @returns {string} 转义后的字符串
   */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
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

  /* ---------- 页面离开提示 ---------- */

  /**
   * 在页面关闭或跳转前提醒用户保存
   */
  window.addEventListener('beforeunload', function (e) {
    var data = collectFormData();
    if (data.title || (data.content && data.content !== '<p><br></p>')) {
      // 有未保存内容，触发浏览器离开提示
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- 初始化 ---------- */

  /**
   * 页面加载完成后初始化编辑器
   */
  function init() {
    initQuill();
    restoreDraft();
  }

  // DOM 就绪后执行初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
