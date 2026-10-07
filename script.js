/* ============================================================
   script.js — интерфейс сайта
   Меню, появление блоков, подсветка узлов, фильтр, галерея, ролики.
   ============================================================ */

(() => {
  "use strict";

  /* ---------------- Бургер-меню ---------------- */

  /* Блокировка прокрутки фона. Класс нужен ещё и затем, чтобы
     прятать прилипшую кнопку звонка под меню и галереей. */
  const lockScroll = (on) => {
    document.body.classList.toggle("is-locked", on);
    document.body.style.overflow = on ? "hidden" : "";
  };

  const initMenu = () => {
    const burger = document.querySelector("[data-burger]");
    const nav = document.querySelector("[data-nav]");
    if (!burger || !nav) return;

    const close = () => {
      nav.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      lockScroll(false);
    };

    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
      lockScroll(open);
    });

    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024) close();
    });
  };

  /* ---------------- Появление блоков при прокрутке ---------------- */

  const initReveal = () => {
    const items = document.querySelectorAll(".reveal");
    if (!items.length || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    items.forEach((el) => io.observe(el));
  };

  /* ---------------- Подсветка узла, который сейчас в разборе ---------------- */

  const initUnits = () => {
    const units = [...document.querySelectorAll("[data-unit]")];
    if (!units.length) return;

    document.addEventListener("scene:unit", (e) => {
      const index = e.detail.index;
      units.forEach((el, i) => el.classList.toggle("is-active", i === index));
    });

    /* Без 3D узлы подсвечиваются по наведению и фокусу */
    if (document.body.classList.contains("scene-off")) {
      units[0].classList.add("is-active");
    }
  };

  /* ---------------- Фильтр каталога техники ---------------- */

  const initFilters = () => {
    const bar = document.querySelector("[data-filters]");
    const list = document.querySelector("[data-machines]");
    if (!bar || !list) return;

    const cards = [...list.querySelectorAll("[data-type]")];
    const empty = document.querySelector("[data-empty]");

    const apply = (type) => {
      let shown = 0;
      cards.forEach((card) => {
        const hit = type === "all" || card.dataset.type === type;
        card.hidden = !hit;
        if (hit) shown += 1;
      });
      if (empty) empty.hidden = shown > 0;
    };

    bar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      bar.querySelectorAll("button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn))
      );
      apply(btn.dataset.filter);
    });
  };

  /* ---------------- Просмотр фотографий техники ---------------- */

  const initLightbox = () => {
    const triggers = [...document.querySelectorAll("[data-gallery]")];
    if (!triggers.length) return;

    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = `
      <div class="lightbox__bar">
        <div>
          <span class="lightbox__title"></span>
          <span class="lightbox__count"></span>
        </div>
        <button type="button" data-lb="close" aria-label="Закрыть">✕</button>
      </div>
      <img alt="">
      <video controls playsinline preload="metadata"></video>
      <div class="lightbox__nav">
        <button type="button" data-lb="prev" aria-label="Предыдущее фото">‹</button>
        <button type="button" data-lb="next" aria-label="Следующее фото">›</button>
      </div>`;
    document.body.appendChild(box);

    const img = box.querySelector("img");
    const video = box.querySelector("video");
    const title = box.querySelector(".lightbox__title");
    const count = box.querySelector(".lightbox__count");
    const nav = box.querySelector(".lightbox__nav");

    let list = [];
    let index = 0;

    const show = () => {
      const src = list[index];
      const isVideo = /\.mp4$/i.test(src);

      video.pause();
      img.hidden = isVideo;
      video.hidden = !isVideo;

      if (isVideo) {
        video.src = src;
      } else {
        video.removeAttribute("src");
        img.src = src;
        img.alt = title.textContent;
      }

      count.textContent = list.length > 1 ? `${index + 1} / ${list.length}` : "";
      nav.hidden = list.length < 2;
    };

    const open = (trigger) => {
      try {
        list = JSON.parse(trigger.dataset.gallery);
      } catch (err) {
        return;
      }
      if (!list.length) return;
      index = Math.min(list.length - 1, Math.max(0, parseInt(trigger.dataset.start, 10) || 0));
      title.textContent = trigger.dataset.title || "";
      show();
      box.classList.add("is-open");
      lockScroll(true);
    };

    const close = () => {
      box.classList.remove("is-open");
      lockScroll(false);
      video.pause();
      video.removeAttribute("src");
      img.removeAttribute("src");
    };

    const step = (delta) => {
      index = (index + delta + list.length) % list.length;
      show();
    };

    triggers.forEach((t) => {
      t.addEventListener("click", () => open(t));
      if (t.tagName !== "BUTTON") {
        t.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open(t);
          }
        });
      }
    });

    box.addEventListener("click", (e) => {
      const action = e.target.closest("[data-lb]");
      if (action) {
        const kind = action.dataset.lb;
        if (kind === "close") close();
        if (kind === "prev") step(-1);
        if (kind === "next") step(1);
        return;
      }
      if (e.target === box) close();
    });

    document.addEventListener("keydown", (e) => {
      if (!box.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
  };

  /* ---------------- Ролики «техника в работе» ----------------
     Грузим и запускаем только то, что попало на экран: иначе
     четыре видео тянут мегабайты ещё до того, как их увидят. */

  const initReels = () => {
    const reels = [...document.querySelectorAll("[data-reel]")];
    if (!reels.length) return;

    if (!("IntersectionObserver" in window)) {
      reels.forEach((v) => {
        v.setAttribute("preload", "metadata");
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (entry.isIntersecting) {
            /* muted ставим свойством: без него iOS не даёт автозапуск */
            video.muted = true;
            video.playsInline = true;
            if (!video.src) video.src = video.dataset.reel;
            const play = video.play();
            if (play) play.catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.35 }
    );

    reels.forEach((v) => io.observe(v));
  };

  /* ---------------- Прилипшая кнопка звонка ----------------
     Пока на экране своя кнопка «позвонить» из первого экрана,
     прилипшая не нужна: две одинаковые оранжевые кнопки подряд
     выглядят ошибкой. Показываем её, когда первая уехала вверх. */

  const initCallbar = () => {
    const bar = document.querySelector(".callbar");
    if (!bar) return;

    const anchor = document.querySelector('main a[href^="tel:"]');
    if (!anchor || !("IntersectionObserver" in window)) {
      bar.classList.add("is-shown");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => bar.classList.toggle("is-shown", !e.isIntersecting)),
      { threshold: 0 }
    );
    io.observe(anchor);
  };

  /* ---------------- Год в подвале ---------------- */

  const initYear = () => {
    const el = document.querySelector("[data-year]");
    if (el) el.textContent = String(new Date().getFullYear());
  };

  /* ---------------- Старт ---------------- */

  const init = () => {
    initMenu();
    initReveal();
    initUnits();
    initFilters();
    initLightbox();
    initReels();
    initCallbar();
    initYear();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
