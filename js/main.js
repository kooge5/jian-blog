/**
 * 简 — 博客交互脚本
 * 功能：导航栏滚动效果、移动端菜单、滚动动画、平滑锚点
 * 作者：钱卫忠
 */

(function () {
  'use strict';

  /* ---------- DOM 元素 ---------- */
  const nav = document.getElementById('nav');
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const postCards = document.querySelectorAll('.post-card');

  /* ---------- 导航栏滚动效果 ---------- */
  /**
   * 页面滚动时为导航栏添加边框
   */
  function handleNavScroll() {
    if (window.scrollY > 10) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });

  /* ---------- 移动端菜单 ---------- */
  /**
   * 切换移动端菜单的展开/收起状态
   */
  function toggleMobileMenu() {
    menuBtn.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    // 控制页面滚动
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  }

  menuBtn.addEventListener('click', toggleMobileMenu);

  // 点击移动端菜单链接后自动关闭
  document.querySelectorAll('.mobile-link').forEach(function (link) {
    link.addEventListener('click', function () {
      if (mobileMenu.classList.contains('open')) {
        toggleMobileMenu();
      }
    });
  });

  /* ---------- 滚动进入动画（IntersectionObserver） ---------- */
  /**
   * 使用 IntersectionObserver 实现文章卡片滚动渐入效果
   */
  function initScrollAnimations() {
    if (!('IntersectionObserver' in window)) {
      // 降级处理：直接显示所有卡片
      postCards.forEach(function (card) {
        card.classList.add('visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            // 添加延迟，实现依次出现效果
            var index = Array.prototype.indexOf.call(postCards, entry.target);
            entry.target.style.transitionDelay = (index * 0.1) + 's';
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    postCards.forEach(function (card) {
      observer.observe(card);
    });
  }

  initScrollAnimations();

  /* ---------- 平滑锚点滚动 ---------- */
  /**
   * 处理带锚点的导航链接，实现平滑滚动
   */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;

      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        var navHeight = nav.offsetHeight;
        var targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  /* ---------- 导航高亮 ---------- */
  /**
   * 根据当前页面 URL 设置导航链接的激活状态
   */
  function setActiveNav() {
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // 桌面端导航
    document.querySelectorAll('.nav-link').forEach(function (link) {
      link.classList.remove('active');
      var href = link.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });

    // 移动端导航
    document.querySelectorAll('.mobile-link').forEach(function (link) {
      link.classList.remove('active');
      var href = link.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  }

  setActiveNav();

})();
