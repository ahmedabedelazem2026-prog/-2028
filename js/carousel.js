// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI (North Sinai, Al-Arish)
// Native Lightweight Luxury Carousel Engine (Zero-Dependency & Offline-Safe)
// Fully compatible with Swiper markup, RTL, Touch Swipes & Autoplay
// =========================================================================

export class CapitalCarousel {
  constructor(containerSelector = '.capital-carousel, .swiper.mySwiper') {
    this.container = document.querySelector(containerSelector);
    if (!this.container) return;

    this.track = this.container.querySelector('.carousel-track, .swiper-wrapper');
    this.slides = Array.from(this.container.querySelectorAll('.carousel-slide, .swiper-slide'));
    this.prevBtn = this.container.querySelector('.carousel-btn-prev, .swiper-button-prev');
    this.nextBtn = this.container.querySelector('.carousel-btn-next, .swiper-button-next');
    this.indicatorsContainer = this.container.querySelector('.carousel-indicators, .swiper-pagination');

    if (!this.track || this.slides.length === 0) return;

    this.currentIndex = 0;
    this.totalSlides = this.slides.length;
    this.autoplayInterval = 3800; // 3.8s per slide
    this.timer = null;
    this.isPaused = false;

    // Touch gesture state
    this.touchStartX = 0;
    this.touchCurrentX = 0;
    this.isDragging = false;

    this.init();
  }

  init() {
    this.renderIndicators();
    this.bindEvents();
    this.updateSlide(0, false);
    this.startAutoplay();
  }

  renderIndicators() {
    if (!this.indicatorsContainer) return;
    this.indicatorsContainer.innerHTML = '';
    this.indicators = [];

    for (let i = 0; i < this.totalSlides; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = i === 0 ? 'carousel-indicator active' : 'carousel-indicator';
      dot.setAttribute('aria-label', `الانتقال إلى الشريحة ${i + 1}`);
      dot.onclick = () => {
        this.goTo(i);
        this.resetAutoplay();
      };
      this.indicatorsContainer.appendChild(dot);
      this.indicators.push(dot);
    }
  }

  updateSlide(index, animate = true) {
    if (index < 0) index = this.totalSlides - 1;
    if (index >= this.totalSlides) index = 0;
    this.currentIndex = index;

    // RTL translation: in RTL, positive translateX moves slides forward
    const offsetPercent = this.currentIndex * 100;
    if (this.track) {
      this.track.style.transition = animate ? 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
      this.track.style.transform = `translateX(${offsetPercent}%)`;
    }

    this.slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === this.currentIndex);
    });

    if (this.indicators && this.indicators.length > 0) {
      this.indicators.forEach((dot, i) => {
        dot.classList.toggle('active', i === this.currentIndex);
      });
    }
  }

  next() {
    this.updateSlide(this.currentIndex + 1);
  }

  prev() {
    this.updateSlide(this.currentIndex - 1);
  }

  goTo(index) {
    this.updateSlide(index);
  }

  startAutoplay() {
    this.stopAutoplay();
    this.timer = setInterval(() => {
      if (!this.isPaused) {
        this.next();
      }
    }, this.autoplayInterval);
  }

  stopAutoplay() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resetAutoplay() {
    this.startAutoplay();
  }

  bindEvents() {
    // Navigation buttons
    if (this.nextBtn) {
      this.nextBtn.onclick = (e) => {
        e.preventDefault();
        this.next();
        this.resetAutoplay();
      };
    }

    if (this.prevBtn) {
      this.prevBtn.onclick = (e) => {
        e.preventDefault();
        this.prev();
        this.resetAutoplay();
      };
    }

    // Pause on hover
    this.container.addEventListener('mouseenter', () => {
      this.isPaused = true;
    });

    this.container.addEventListener('mouseleave', () => {
      this.isPaused = false;
    });

    // Touch / Swipe gestures for mobile
    this.container.addEventListener('touchstart', (e) => {
      this.touchStartX = e.touches[0].clientX;
      this.touchCurrentX = this.touchStartX;
      this.isDragging = true;
      this.isPaused = true;
    }, { passive: true });

    this.container.addEventListener('touchmove', (e) => {
      if (!this.isDragging) return;
      this.touchCurrentX = e.touches[0].clientX;
    }, { passive: true });

    this.container.addEventListener('touchend', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.isPaused = false;
      const diffX = this.touchCurrentX - this.touchStartX;
      const threshold = 40; // minimum pixels to trigger swipe

      if (Math.abs(diffX) > threshold) {
        // In RTL: dragging right (diffX > 0) goes next, dragging left (diffX < 0) goes prev
        if (diffX > 0) {
          this.next();
        } else {
          this.prev();
        }
      }
      this.resetAutoplay();
    }, { passive: true });

    // Keyboard navigation
    this.container.setAttribute('tabindex', '0');
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        this.prev();
        this.resetAutoplay();
      } else if (e.key === 'ArrowLeft') {
        this.next();
        this.resetAutoplay();
      }
    });
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new CapitalCarousel());
  } else {
    new CapitalCarousel();
  }
}
