const fallbackGameSessions = [
  {
    score: 1160,
    correctCount: 9,
    totalRounds: 12,
    accuracy: 0.75,
    bestStreak: 5,
    createdAt: "2026-07-14T15:13:37.280Z",
  },
  {
    score: 720,
    correctCount: 6,
    totalRounds: 12,
    accuracy: 0.5,
    bestStreak: 4,
    createdAt: "2026-07-14T14:35:17.005Z",
  },
];

const metricGrid = document.querySelector("#metricGrid");
const sessionList = document.querySelector("#sessionList");
const scoreChart = document.querySelector("#scoreChart");
const accuracyDonut = document.querySelector("#accuracyDonut");
const accuracyDonutLabel = document.querySelector("#accuracyDonutLabel");
const dashboardSource = document.querySelector("#dashboardSource");
const menuButton = document.querySelector(".menu-button");
const navLinks = document.querySelector("#site-nav");
const screenSlider = document.querySelector("[data-screen-slider]");
const screenStage = document.querySelector(".screen-stage");
const screenSlides = Array.from(document.querySelectorAll("[data-screen-slide]"));
const screenDots = Array.from(document.querySelectorAll("[data-screen-dot]"));
const screenPrevButton = document.querySelector("[data-screen-prev]");
const screenNextButton = document.querySelector("[data-screen-next]");
const screenCounter = document.querySelector("[data-screen-counter]");
const practiceGame = document.querySelector("[data-practice-game]");
const practiceVideo = document.querySelector("[data-practice-video]");
const practiceSource = practiceVideo?.querySelector("source");
const practiceAnswerButtons = Array.from(
  document.querySelectorAll("[data-practice-answer]"),
);
const practiceFeedback = document.querySelector("[data-practice-feedback]");
const practiceNextButton = document.querySelector("[data-practice-next]");
const practiceCount = document.querySelector("[data-practice-count]");
const visibilityVideo = document.querySelector("[data-visibility-video]");

const practiceClips = [
  {
    src: "assets/practice-real.mp4",
    answer: "real",
    verdict: "Real",
  },
  {
    src: "assets/practice-fake.mp4",
    answer: "fake",
    verdict: "Fake",
  },
];

const formatPercent = (value) => `${Math.round(value * 100)}%`;

const clampProbability = (value) => Math.max(0, Math.min(1, value));

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toOptionalNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeSession = (session) => {
  const totalRounds = Math.max(0, Math.round(toNumber(session.totalRounds)));
  const correctCount = Math.max(0, Math.round(toNumber(session.correctCount)));
  const accuracy =
    session.accuracy === undefined && totalRounds > 0
      ? correctCount / totalRounds
      : toNumber(session.accuracy);

  return {
    score: Math.max(0, Math.round(toNumber(session.score))),
    correctCount,
    totalRounds,
    accuracy: clampProbability(accuracy),
    bestStreak: Math.max(0, Math.round(toNumber(session.bestStreak))),
    createdAt: typeof session.createdAt === "string" ? session.createdAt : "",
  };
};

const normalizeSessions = (sessions) => {
  if (!Array.isArray(sessions)) {
    return [];
  }

  return sessions.map(normalizeSession).filter((session) => session.totalRounds > 0);
};

const buildDashboardData = (sessions, aggregate = {}) => {
  const totals = sessions.reduce(
    (acc, session) => {
      acc.score += session.score;
      acc.correct += session.correctCount;
      acc.rounds += session.totalRounds;
      acc.bestScore = Math.max(acc.bestScore, session.score);
      acc.bestStreak = Math.max(acc.bestStreak, session.bestStreak);
      return acc;
    },
    {
      score: 0,
      correct: 0,
      rounds: 0,
      bestScore: 0,
      bestStreak: 0,
    },
  );

  const sessionCount = toOptionalNumber(aggregate.sessionCount);
  const averageAccuracy = toOptionalNumber(aggregate.averageAccuracy);
  const totalRounds = toOptionalNumber(aggregate.totalRounds);
  const totalCorrect = toOptionalNumber(aggregate.totalCorrect);
  const bestScore = toOptionalNumber(aggregate.bestScore);
  const bestStreak = toOptionalNumber(aggregate.bestStreak);

  return {
    sessions,
    sessionCount: sessionCount ?? sessions.length,
    averageAccuracy: clampProbability(
      averageAccuracy ?? (totals.rounds === 0 ? 0 : totals.correct / totals.rounds),
    ),
    totalRounds: totalRounds ?? totals.rounds,
    totalCorrect: totalCorrect ?? totals.correct,
    bestScore: bestScore ?? totals.bestScore,
    bestStreak: bestStreak ?? totals.bestStreak,
  };
};

const getApiBaseUrl = () => {
  const configuredBaseUrl = window.VIGILVID_API_BASE_URL;
  if (typeof configuredBaseUrl === "string" && configuredBaseUrl.trim()) {
    return configuredBaseUrl.trim().replace(/\/+$/, "");
  }

  if (window.location.protocol === "file:") {
    return "";
  }

  return window.location.origin;
};

const normalizeBackendInsights = (payload) => {
  const game = payload?.game && typeof payload.game === "object" ? payload.game : {};
  const sessions = normalizeSessions(game.recentSessions);

  let sourceMessage = "Live project stats loaded.";
  if (payload?.source === "not_configured") {
    sourceMessage = "Live project stats are not configured yet.";
  }
  if (payload?.source === "unavailable") {
    sourceMessage = "Live project stats are temporarily unavailable.";
  }

  return {
    sessions,
    aggregate: game,
    sourceMessage,
  };
};

const fetchBackendInsights = async () => {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/insights`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return normalizeBackendInsights(await response.json());
  } catch {
    return null;
  }
};

const renderMetric = ({ label, value, note }) => {
  const article = document.createElement("article");
  article.className = "metric-card";

  const valueElement = document.createElement("strong");
  valueElement.textContent = String(value);

  const labelElement = document.createElement("p");
  labelElement.textContent = label;

  const noteElement = document.createElement("span");
  noteElement.textContent = note;

  article.append(valueElement, labelElement, noteElement);
  return article;
};

const renderEmptyState = (container, message) => {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = message;
  container.replaceChildren(element);
};

const renderInsights = ({ sessions, aggregate, sourceMessage }) => {
  if (
    !metricGrid ||
    !sessionList ||
    !scoreChart ||
    !accuracyDonut ||
    !accuracyDonutLabel
  ) {
    return;
  }

  const insights = buildDashboardData(sessions, aggregate);
  const hasSessions = insights.sessionCount > 0;
  const metricItems = [
    {
      label: "Game sessions",
      value: insights.sessionCount,
      note: hasSessions
        ? "Completed Real or Fake games included in the total."
        : "No completed Real or Fake games yet.",
    },
    {
      label: "Average accuracy",
      value: formatPercent(insights.averageAccuracy),
      note: `${insights.totalCorrect} correct answers from ${insights.totalRounds} rounds.`,
    },
    {
      label: "Best score",
      value: insights.bestScore,
      note: `Best streak recorded: ${insights.bestStreak}.`,
    },
  ];

  if (dashboardSource) {
    dashboardSource.textContent = sourceMessage;
  }

  metricGrid.replaceChildren(...metricItems.map(renderMetric));
  accuracyDonut.style.setProperty(
    "--donut-value",
    `${Math.round(insights.averageAccuracy * 100)}%`,
  );
  accuracyDonutLabel.textContent = formatPercent(insights.averageAccuracy);

  if (sessions.length === 0) {
    renderEmptyState(sessionList, "No recent Real or Fake games to chart yet.");
    renderEmptyState(scoreChart, "No score chart available yet.");
    return;
  }

  const rows = sessions.map((session, index) => {
    const row = document.createElement("div");
    row.className = "session-row";

    const score = document.createElement("div");
    score.className = "session-score";
    score.textContent = `Run ${index + 1}`;

    const bar = document.createElement("div");
    bar.className = "session-bar";
    bar.setAttribute("aria-label", `Accuracy ${formatPercent(session.accuracy)}`);

    const fill = document.createElement("span");
    fill.style.width = `${Math.round(session.accuracy * 100)}%`;
    bar.append(fill);

    const accuracy = document.createElement("div");
    accuracy.className = "session-accuracy";
    accuracy.textContent = formatPercent(session.accuracy);

    row.append(score, bar, accuracy);
    return row;
  });

  sessionList.replaceChildren(...rows);

  const maxScore = Math.max(...sessions.map((session) => session.score), 1);
  const scoreRows = sessions.map((session, index) => {
    const row = document.createElement("div");
    row.className = "score-row";

    const label = document.createElement("div");
    label.className = "score-label";
    label.textContent = `Run ${index + 1}`;

    const track = document.createElement("div");
    track.className = "score-track";
    track.setAttribute("aria-label", `Score ${session.score}`);

    const fill = document.createElement("span");
    fill.style.width = `${Math.round((session.score / maxScore) * 100)}%`;
    track.append(fill);

    const value = document.createElement("div");
    value.className = "score-value";
    value.textContent = String(session.score);

    row.append(label, track, value);
    return row;
  });

  scoreChart.replaceChildren(...scoreRows);
};

const loadDashboard = async () => {
  if (
    !metricGrid ||
    !sessionList ||
    !scoreChart ||
    !accuracyDonut ||
    !accuracyDonutLabel
  ) {
    return;
  }

  const liveInsights = await fetchBackendInsights();
  if (liveInsights) {
    renderInsights(liveInsights);
    return;
  }

  renderInsights({
    sessions: fallbackGameSessions,
    aggregate: {},
    sourceMessage:
      "Showing sample project data while live stats are unavailable.",
  });
};

const closeMenu = () => {
  if (!menuButton || !navLinks) {
    return;
  }
  menuButton.setAttribute("aria-expanded", "false");
  navLinks.classList.remove("is-open");
};

if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    navLinks.classList.toggle("is-open", !isOpen);
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      closeMenu();
    }
  });
}

if (
  screenSlider &&
  screenStage &&
  screenSlides.length > 0 &&
  screenPrevButton instanceof HTMLButtonElement &&
  screenNextButton instanceof HTMLButtonElement
) {
  let activeScreenIndex = 0;
  const screenCount = screenSlides.length;

  const wrapScreenIndex = (index) => (index + screenCount) % screenCount;

  const renderScreenSlider = () => {
    screenSlides.forEach((slide, index) => {
      const forwardDistance = wrapScreenIndex(index - activeScreenIndex);
      const backwardDistance = wrapScreenIndex(activeScreenIndex - index);

      slide.classList.remove(
        "is-active",
        "is-prev",
        "is-next",
        "is-far-prev",
        "is-far-next",
      );

      if (index === activeScreenIndex) {
        slide.classList.add("is-active");
        slide.removeAttribute("aria-hidden");
      } else {
        slide.setAttribute("aria-hidden", "true");

        if (backwardDistance === 1) {
          slide.classList.add("is-prev");
        } else if (forwardDistance === 1) {
          slide.classList.add("is-next");
        } else if (backwardDistance === 2) {
          slide.classList.add("is-far-prev");
        } else if (forwardDistance === 2) {
          slide.classList.add("is-far-next");
        }
      }
    });

    screenDots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeScreenIndex);
      dot.setAttribute("aria-current", index === activeScreenIndex ? "true" : "false");
    });

    if (screenCounter) {
      screenCounter.textContent = `${activeScreenIndex + 1} / ${screenCount}`;
    }
  };

  const setActiveScreen = (index) => {
    activeScreenIndex = wrapScreenIndex(index);
    renderScreenSlider();
  };

  screenPrevButton.addEventListener("click", () => {
    setActiveScreen(activeScreenIndex - 1);
  });

  screenNextButton.addEventListener("click", () => {
    setActiveScreen(activeScreenIndex + 1);
  });

  screenDots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      setActiveScreen(index);
    });
  });

  screenStage.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveScreen(activeScreenIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveScreen(activeScreenIndex + 1);
    }
  });

  renderScreenSlider();
}

if (
  practiceGame &&
  practiceVideo instanceof HTMLVideoElement &&
  practiceSource instanceof HTMLSourceElement &&
  practiceFeedback &&
  practiceNextButton instanceof HTMLButtonElement &&
  practiceCount
) {
  let activePracticeIndex = 0;
  let hasAnswered = false;

  const resetPracticeButtons = () => {
    practiceAnswerButtons.forEach((button) => {
      button.classList.remove("is-correct", "is-wrong");
      button.removeAttribute("aria-pressed");
      button.disabled = false;
    });
  };

  const renderPracticeClip = () => {
    const clip = practiceClips[activePracticeIndex];
    hasAnswered = false;
    practiceSource.src = clip.src;
    practiceVideo.load();
    resetPracticeButtons();
    practiceCount.textContent = `Clip ${activePracticeIndex + 1} of ${practiceClips.length}`;
    practiceFeedback.className = "practice-feedback";
    practiceFeedback.textContent = "Watch the clip, then pick Real or Fake.";
  };

  practiceAnswerButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", () => {
      if (hasAnswered) {
        return;
      }

      const selectedAnswer = button.dataset.practiceAnswer;
      const clip = practiceClips[activePracticeIndex];
      const isCorrect = selectedAnswer === clip.answer;
      hasAnswered = true;

      practiceAnswerButtons.forEach((answerButton) => {
        if (!(answerButton instanceof HTMLButtonElement)) {
          return;
        }

        const isCorrectButton = answerButton.dataset.practiceAnswer === clip.answer;
        answerButton.classList.toggle("is-correct", isCorrectButton);
        answerButton.classList.toggle(
          "is-wrong",
          answerButton === button && !isCorrect,
        );
        answerButton.setAttribute(
          "aria-pressed",
          answerButton === button ? "true" : "false",
        );
        answerButton.disabled = true;
      });

      practiceFeedback.classList.toggle("is-correct", isCorrect);
      practiceFeedback.classList.toggle("is-wrong", !isCorrect);
      practiceFeedback.textContent = isCorrect
        ? `Good call. This clip is labeled ${clip.verdict}.`
        : `The correct answer is ${clip.verdict}.`;
    });
  });

  practiceNextButton.addEventListener("click", () => {
    activePracticeIndex = (activePracticeIndex + 1) % practiceClips.length;
    renderPracticeClip();
  });

  renderPracticeClip();
}

if (visibilityVideo instanceof HTMLVideoElement) {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const playVisibilityVideo = () => {
    if (prefersReducedMotion) {
      return;
    }

    visibilityVideo.play().catch(() => {
      // Browsers can block autoplay in some settings. The video remains paused.
    });
  };

  const pauseVisibilityVideo = () => {
    visibilityVideo.pause();
  };

  const isVisibilityVideoInView = () => {
    const rect = visibilityVideo.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.75 && rect.bottom > window.innerHeight * 0.15;
  };

  const syncVisibilityVideo = () => {
    if (document.hidden || !isVisibilityVideoInView()) {
      pauseVisibilityVideo();
      return;
    }

    playVisibilityVideo();
  };

  visibilityVideo.muted = true;
  visibilityVideo.loop = true;
  visibilityVideo.controls = false;

  if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || document.hidden || entry.intersectionRatio < 0.45) {
          pauseVisibilityVideo();
          return;
        }

        playVisibilityVideo();
      },
      {
        threshold: [0, 0.45, 0.8],
      },
    );

    videoObserver.observe(visibilityVideo);
  } else {
    window.addEventListener("scroll", syncVisibilityVideo, { passive: true });
    window.addEventListener("resize", syncVisibilityVideo);
    syncVisibilityVideo();
  }

  document.addEventListener("visibilitychange", () => {
    syncVisibilityVideo();
  });
}

loadDashboard();
