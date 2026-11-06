import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import NotificationsSection from "./NotificationsSection.jsx";
import AnalyticsSection from "./AnalyticsSection.jsx";
import AdminsSection from "./AdminsSection.jsx";
import { buildMovieShareContent } from "../../src/lib/movie-sharing.js";

const PRODUCTION_API_URL =
  "https://findly-v3-api.berrchidcity99.workers.dev";
const PREVIEW_API_URL =
  "https://feat-findly-movies-runtime-hardening-findly-v3-api.berrchidcity99.workers.dev";
const isPagesPreview =
  typeof window !== "undefined" &&
  (window.location.hostname ===
    "feat-findly-movies-runtime-h.findly-bottelegram.pages.dev" ||
    /^[a-f0-9]{8}\.findly-bottelegram\.pages\.dev$/.test(
      window.location.hostname
    ));
const API_URL =
  import.meta.env.VITE_API_URL ||
  (isPagesPreview ? PREVIEW_API_URL : PRODUCTION_API_URL);

const menuGroups = [
  { icon: "🏠", label: "Overview", items: ["Overview"] },
  { icon: "🤖", label: "Bots & Telegram", items: ["Bots", "Telegram"] },
  { icon: "🎬", label: "Movies & Categories", items: ["Movies", "Categories"] },
  { icon: "🗂️", label: "Menus & Content", items: ["Menus", "Content"] },
  { icon: "👥", label: "Users & Admins", items: ["Users", "Admins"] },
  { icon: "🔔", label: "Notifications", items: ["Notifications"] },
  { icon: "📊", label: "Analytics", items: ["Analytics"] },
  { icon: "💰", label: "Monetization", items: ["Monetization"] },
  { icon: "✨", label: "AI", items: ["AI"] },
  { icon: "📝", label: "Activity Log", items: ["Activity Log"] },
  { icon: "⚙️", label: "Settings", items: ["Settings"] },
  { icon: "📣", label: "Publishing & Sharing", items: ["Publishing & Sharing"] }
];

const emptyBot = {
  name: "",
  slug: "",
  bot_type: "child",
  telegram_username: "",
  description: "",
  icon: "🤖",
  is_active: true,
  sort_order: 0
};

const emptyCategory = {
  name: "",
  slug: "",
  icon: "📁",
  description: "",
  is_active: true,
  sort_order: 0
};

const emptyMenu = {
  bot_id: "",
  parent_id: "",
  label: "",
  icon: "🔘",
  action_type: "category",
  action_value: "",
  is_active: true,
  sort_order: 0
};

const emptyContent = {
  bot_id: "",
  category_id: "",
  content_type: "general",
  title: "",
  description: "",
  image_url: "",
  external_url: "",
  metadata: "{}",
  is_active: true,
  published_at: ""
};

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [resetMode, setResetMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatePasswordLoading, setUpdatePasswordLoading] =
    useState(false);
  const [updatePasswordError, setUpdatePasswordError] =
    useState("");

  const [activeSection, setActiveSection] =
    useState("Overview");
  const [expandedMenuGroup, setExpandedMenuGroup] = useState("");
  const [telegramBotSlug, setTelegramBotSlug] = useState("findly");
const [telegramLoading, setTelegramLoading] = useState(false);
const [telegramStatus, setTelegramStatus] = useState("Not connected");
const [telegramMessage, setTelegramMessage] = useState("");
const [telegramError, setTelegramError] = useState("");
const [telegramWebhookInfo, setTelegramWebhookInfo] = useState(null);
const [telegramWebhookChecking, setTelegramWebhookChecking] = useState(false);

  const [bots, setBots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menus, setMenus] = useState([]);
  const [users, setUsers] = useState([]);
  const [content, setContent] = useState([]);
  const [movies, setMovies] = useState([]);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const [botModal, setBotModal] = useState(null);
  const [botForm, setBotForm] = useState({
    ...emptyBot
  });
  const [botSaving, setBotSaving] = useState(false);
  const [botFormError, setBotFormError] = useState("");

  const [categoryModal, setCategoryModal] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    ...emptyCategory
  });
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryFormError, setCategoryFormError] =
    useState("");

  const [menuModal, setMenuModal] = useState(null);
  const [menuForm, setMenuForm] = useState({
    ...emptyMenu
  });
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuFormError, setMenuFormError] = useState("");
  const [menuBotFilter, setMenuBotFilter] = useState("");

  const [contentModal, setContentModal] = useState(null);
  const [contentForm, setContentForm] = useState({
    ...emptyContent
  });
  const [contentSaving, setContentSaving] = useState(false);
  const [contentFormError, setContentFormError] =
    useState("");
  const [contentBotFilter, setContentBotFilter] =
    useState("");
  const [contentCategoryFilter, setContentCategoryFilter] =
    useState("");

  const [userBotFilter, setUserBotFilter] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (mounted) {
          setSession(session);
        }
      } catch (error) {
        console.error(error);

        if (mounted) {
          setLoginError(
            error.message ||
              "Failed to restore session"
          );
        }
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) {
          return;
        }

        if (event === "PASSWORD_RECOVERY") {
          setRecoveryMode(true);
          setResetMode(false);
          setLoginError("");
          setUpdatePasswordError("");
        }

        setSession(session);
        setAuthLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();

    try {
      setLoginLoading(true);
      setLoginError("");

      const cleanEmail = email.trim();

      const { error } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

      if (error) {
        throw error;
      }

      setPassword("");
      setResetMode(false);
      setResetMessage("");
    } catch (error) {
      console.error(error);

      setLoginError(
        error.message || "Login failed"
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handlePasswordReset(event) {
    event.preventDefault();

    try {
      setResetLoading(true);
      setLoginError("");
      setResetMessage("");

      const cleanEmail = email.trim();

      if (!cleanEmail) {
        throw new Error(
          "Please enter your email address."
        );
      }

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo:
              window.location.origin
          }
        );

      if (error) {
        throw error;
      }

      setResetMessage(
        "If an account exists for this email, a password reset link has been sent."
      );
    } catch (error) {
      console.error(error);

      setLoginError(
        error.message ||
          "Unable to send password reset email."
      );
    } finally {
      setResetLoading(false);
    }
  }

  async function handleUpdatePassword(event) {
    event.preventDefault();

    try {
      setUpdatePasswordLoading(true);
      setUpdatePasswordError("");

      if (newPassword.length < 8) {
        throw new Error(
          "Password must be at least 8 characters."
        );
      }

      if (newPassword !== confirmPassword) {
        throw new Error(
          "Passwords do not match."
        );
      }

      const { error } =
        await supabase.auth.updateUser({
          password: newPassword
        });

      if (error) {
        throw error;
      }

      await supabase.auth.signOut();

      setSession(null);
      setRecoveryMode(false);
      setResetMode(false);
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
      setLoginError("");

      setResetMessage(
        "Your password has been updated successfully. You can now sign in with your new password."
      );
    } catch (error) {
      console.error(error);

      setUpdatePasswordError(
        error.message ||
          "Unable to update password."
      );
    } finally {
      setUpdatePasswordLoading(false);
    }
  }

  async function handleLogout() {
    try {
      setApiError("");

      const { error } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(error);

      setApiError(
        error.message || "Logout failed"
      );
    }
  }

  function selectTelegramBot(slug) {
    setTelegramBotSlug(slug);
    setTelegramStatus("Not connected");
    setTelegramMessage("");
    setTelegramError("");
    setTelegramWebhookInfo(null);
  }

  async function connectTelegramWebhook() {
    try {
      setTelegramLoading(true);
      setTelegramError("");
      setTelegramMessage("");
  
      const result = await fetchApi(
        `/api/telegram/webhook/${telegramBotSlug}`,
        {
          method: "POST"
        }
      );
  
      const statusResult = await fetchApi(`/api/telegram/webhook/${telegramBotSlug}`);
      setTelegramWebhookInfo({
        ...(statusResult?.webhook || {}),
        identity: statusResult?.identity || null
      });
      setTelegramStatus("Connected");
      setTelegramMessage(
        result?.webhook
          ? `Webhook connected: ${result.webhook}`
          : "Telegram webhook connected successfully."
      );
    } catch (error) {
      console.error(error);
      setTelegramStatus("Connection failed");
      setTelegramError(
        error.message ||
          "Unable to connect Telegram webhook."
      );
    } finally {
      setTelegramLoading(false);
    }
  }
  
  async function checkTelegramWebhook() {
    try {
      setTelegramWebhookChecking(true);
      setTelegramError("");
      setTelegramMessage("");

      const result = await fetchApi(
        "/api/telegram/webhook/findly"
      );

      const webhook = result?.webhook || null;
      setTelegramWebhookInfo({
        ...(webhook || {}),
        identity: result?.identity || null
      });

      if (result?.identity?.matches_configured_username && webhook?.url) {
        setTelegramStatus("Connected");
        setTelegramMessage("Telegram identity and webhook are verified.");
      } else if (!result?.identity?.matches_configured_username) {
        setTelegramStatus("Identity mismatch");
        setTelegramMessage("Telegram token does not match the configured bot username.");
      } else {
        setTelegramStatus("Not connected");
        setTelegramMessage("Bot identity verified; webhook is not configured.");
      }
    } catch (error) {
      console.error(error);
      setTelegramWebhookInfo(null);
      setTelegramError(
        error.message ||
          "Unable to check Telegram webhook status."
      );
    } finally {
      setTelegramWebhookChecking(false);
    }
  }

  async function disconnectTelegramWebhook() {
    try {
      setTelegramLoading(true);
      setTelegramError("");
      setTelegramMessage("");
  
      await fetchApi(
        "/api/telegram/webhook/findly",
        {
          method: "DELETE"
        }
      );
  
      setTelegramStatus("Disconnected");
      setTelegramMessage(
        "Telegram webhook disconnected."
      );
    } catch (error) {
      console.error(error);
      setTelegramError(
        error.message ||
          "Unable to disconnect Telegram webhook."
      );
    } finally {
      setTelegramLoading(false);
    }
  }

  async function fetchApi(
    endpoint,
    options = {}
  ) {
    if (!session?.access_token) {
      throw new Error(
        "Authentication session is missing"
      );
    }

    const response = await fetch(
      `${API_URL}${endpoint}`,
      {
        ...options,
        headers: {
          Authorization:
            `Bearer ${session.access_token}`,
          "Content-Type":
            "application/json",
          ...(options.headers || {})
        }
      }
    );
    const result =
      await response.json().catch(
        () => null
      );

    if (
      !response.ok ||
      !result?.success
    ) {
      const apiCode = result?.error?.code || "UNKNOWN_API_ERROR";
      const apiMessage = result?.error?.message || `API ${response.status}`;

      throw new Error(
        `API ${response.status} [${apiCode}]: ${apiMessage} | session_token_present=${Boolean(session?.access_token)}`
      );
    }

    return result.data ?? [];
  }

  async function loadDashboard() {
    if (
      !session?.access_token ||
      recoveryMode
    ) {
      return;
    }

    try {
      setLoading(true);
      setApiError("");

      const [
        botsData,
        categoriesData,
        usersData,
        contentData,
        moviesData
      ] = await Promise.all([
        fetchApi("/api/bots"),
        fetchApi("/api/categories"),
        fetchApi("/api/users"),
        fetchApi("/api/content"),
        fetchApi("/api/movies")
      ]);

      setBots(botsData || []);
      setCategories(
        categoriesData || []
      );
      setUsers(usersData || []);
      setContent(contentData || []);
      setMovies(moviesData || []);

      if (menuBotFilter) {
        const menusData =
          await fetchApi(
            `/api/menus?bot=${encodeURIComponent(
              getBotSlug(menuBotFilter)
            )}`
          );

        setMenus(menusData || []);
      } else {
        setMenus([]);
      }
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Failed to load dashboard"
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadMenus(botId = "") {
    try {
      setApiError("");

      if (!botId) {
        setMenus([]);
        return;
      }

      const slug =
        getBotSlug(botId);

      if (!slug) {
        setMenus([]);
        return;
      }

      const data =
        await fetchApi(
          `/api/menus?bot=${encodeURIComponent(
            slug
          )}`
        );

      setMenus(data || []);
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Failed to load menus"
      );
    }
  }

  useEffect(() => {
    if (!session || recoveryMode) {
      setBots([]);
      setCategories([]);
      setMenus([]);
      setUsers([]);
      setContent([]);
      setMovies([]);
      setLoading(false);
      return;
    }

    loadDashboard();
  }, [session, recoveryMode]);

  useEffect(() => {
    if (
      session &&
      !recoveryMode &&
      activeSection === "Menus"
    ) {
      loadMenus(menuBotFilter);
    }
  }, [
    menuBotFilter,
    activeSection
  ]);

  function getBotSlug(botId) {
    return (
      bots.find(
        (bot) => bot.id === botId
      )?.slug || ""
    );
  }

  function getBotName(botId) {
    return (
      bots.find(
        (bot) => bot.id === botId
      )?.name || "Unknown bot"
    );
  }

  function getCategoryName(
    categoryId
  ) {
    return (
      categories.find(
        (category) =>
          category.id === categoryId
      )?.name || "No category"
    );
  }

  function openCreateBot() {
    setBotForm({
      ...emptyBot
    });

    setBotFormError("");
    setBotModal("create");
  }

  function openEditBot(bot) {
    setBotForm({
      name: bot.name || "",
      slug: bot.slug || "",
      bot_type:
        bot.bot_type || "child",
      telegram_username:
        bot.telegram_username || "",
      description:
        bot.description || "",
      icon: bot.icon || "🤖",
      is_active:
        bot.is_active !== false,
      sort_order:
        bot.sort_order ?? 0
    });

    setBotFormError("");
    setBotModal(bot);
  }

  function closeBotModal() {
    if (botSaving) {
      return;
    }

    setBotModal(null);
    setBotFormError("");
  }

  async function saveBot(event) {
    event.preventDefault();

    try {
      setBotSaving(true);
      setBotFormError("");
      setApiError("");

      if (
        !botForm.name.trim() ||
        !botForm.slug.trim() ||
        !botForm.bot_type.trim()
      ) {
        throw new Error(
          "Name, slug and bot type are required."
        );
      }

      const payload = {
        ...botForm,
        name: botForm.name.trim(),
        slug: botForm.slug.trim(),
        telegram_username:
          botForm.telegram_username.trim() ||
          null,
        description:
          botForm.description.trim() ||
          null,
        icon:
          botForm.icon.trim() ||
          "🤖",
        sort_order:
          Number(botForm.sort_order) || 0
      };

      if (botModal === "create") {
        await fetchApi(
          "/api/bots",
          {
            method: "POST",
            body: JSON.stringify(
              payload
            )
          }
        );
      } else {
        await fetchApi(
          `/api/bots/${botModal.id}`,
          {
            method: "PUT",
            body: JSON.stringify(
              payload
            )
          }
        );
      }

      setBotModal(null);
      await loadDashboard();
    } catch (error) {
      console.error(error);

      setBotFormError(
        error.message ||
          "Unable to save bot."
      );
    } finally {
      setBotSaving(false);
    }
  }

  async function toggleBot(bot) {
    try {
      setApiError("");

      await fetchApi(
        `/api/bots/${bot.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            is_active:
              !bot.is_active
          })
        }
      );

      await loadDashboard();
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Unable to update bot."
      );
    }
  }

  function openCreateCategory() {
    setCategoryForm({
      ...emptyCategory
    });

    setCategoryFormError("");
    setCategoryModal("create");
  }

  function openEditCategory(category) {
    setCategoryForm({
      name: category.name || "",
      slug: category.slug || "",
      icon: category.icon || "📁",
      description:
        category.description || "",
      is_active:
        category.is_active !== false,
      sort_order:
        category.sort_order ?? 0
    });

    setCategoryFormError("");
    setCategoryModal(category);
  }

  function closeCategoryModal() {
    if (categorySaving) {
      return;
    }

    setCategoryModal(null);
    setCategoryFormError("");
  }

  async function saveCategory(event) {
    event.preventDefault();

    try {
      setCategorySaving(true);
      setCategoryFormError("");
      setApiError("");

      if (
        !categoryForm.name.trim() ||
        !categoryForm.slug.trim()
      ) {
        throw new Error(
          "Name and slug are required."
        );
      }

      const payload = {
        ...categoryForm,
        name:
          categoryForm.name.trim(),
        slug:
          categoryForm.slug.trim(),
        icon:
          categoryForm.icon.trim() ||
          "📁",
        description:
          categoryForm.description.trim() ||
          null,
        sort_order:
          Number(
            categoryForm.sort_order
          ) || 0
      };

      if (
        categoryModal === "create"
      ) {
        await fetchApi(
          "/api/categories",
          {
            method: "POST",
            body: JSON.stringify(
              payload
            )
          }
        );
      } else {
        await fetchApi(
          `/api/categories/${categoryModal.id}`,
          {
            method: "PUT",
            body: JSON.stringify(
              payload
            )
          }
        );
      }

      setCategoryModal(null);
      await loadDashboard();
    } catch (error) {
      console.error(error);

      setCategoryFormError(
        error.message ||
          "Unable to save category."
      );
    } finally {
      setCategorySaving(false);
    }
  }

  async function toggleCategory(
    category
  ) {
    try {
      setApiError("");

      await fetchApi(
        `/api/categories/${category.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            is_active:
              !category.is_active
          })
        }
      );

      await loadDashboard();
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Unable to update category."
      );
    }
  }

  function openCreateMenu() {
    if (!bots.length) {
      setApiError(
        "Create a bot first before creating a menu item."
      );
      return;
    }

    setMenuForm({
      ...emptyMenu,
      bot_id:
        menuBotFilter ||
        bots[0]?.id ||
        ""
    });

    setMenuFormError("");
    setMenuModal("create");
  }

  function openEditMenu(item) {
    setMenuForm({
      bot_id:
        item.bot_id || "",
      parent_id:
        item.parent_id || "",
      label:
        item.label || "",
      icon:
        item.icon || "🔘",
      action_type:
        item.action_type ||
        "category",
      action_value:
        item.action_value || "",
      is_active:
        item.is_active !== false,
      sort_order:
        item.sort_order ?? 0
    });

    setMenuFormError("");
    setMenuModal(item);
  }

  function closeMenuModal() {
    if (menuSaving) {
      return;
    }

    setMenuModal(null);
    setMenuFormError("");
  }

  async function saveMenu(event) {
    event.preventDefault();

    try {
      setMenuSaving(true);
      setMenuFormError("");
      setApiError("");

      if (
        !menuForm.bot_id ||
        !menuForm.label.trim()
      ) {
        throw new Error(
          "Bot and menu label are required."
        );
      }

      const payload = {
        ...menuForm,
        parent_id:
          menuForm.parent_id ||
          null,
        label:
          menuForm.label.trim(),
        icon:
          menuForm.icon.trim() ||
          "🔘",
        action_type:
          menuForm.action_type.trim() ||
          "category",
        action_value:
          menuForm.action_value.trim() ||
          null,
        sort_order:
          Number(
            menuForm.sort_order
          ) || 0
      };

      if (
        menuModal === "create"
      ) {
        await fetchApi(
          "/api/menus",
          {
            method: "POST",
            body: JSON.stringify(
              payload
            )
          }
        );
      } else {
        await fetchApi(
          `/api/menus/${menuModal.id}`,
          {
            method: "PUT",
            body: JSON.stringify(
              payload
            )
          }
        );
      }

      setMenuModal(null);

      setMenuBotFilter(
        payload.bot_id
      );

      await loadMenus(
        payload.bot_id
      );
    } catch (error) {
      console.error(error);

      setMenuFormError(
        error.message ||
          "Unable to save menu item."
      );
    } finally {
      setMenuSaving(false);
    }
  }

  async function toggleMenu(item) {
    try {
      setApiError("");

      await fetchApi(
        `/api/menus/${item.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            is_active:
              !item.is_active
          })
        }
      );

      await loadMenus(
        item.bot_id
      );
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Unable to update menu item."
      );
    }
  }

  function openCreateContent() {
    if (!bots.length) {
      setApiError(
        "Create a bot first before creating content."
      );
      return;
    }

    setContentForm({
      ...emptyContent,
      bot_id:
        contentBotFilter ||
        bots[0]?.id ||
        ""
    });

    setContentFormError("");
    setContentModal("create");
  }

  function openEditContent(item) {
    setContentForm({
      bot_id:
        item.bot_id || "",
      category_id:
        item.category_id || "",
      content_type:
        item.content_type ||
        "general",
      title:
        item.title || "",
      description:
        item.description || "",
      image_url:
        item.image_url || "",
      external_url:
        item.external_url || "",
      metadata:
        JSON.stringify(
          item.metadata || {},
          null,
          2
        ),
      is_active:
        item.is_active !== false,
      published_at:
        item.published_at
          ? item.published_at.slice(
              0,
              16
            )
          : ""
    });
        setContentFormError("");
    setContentModal(item);
  }

  function closeContentModal() {
    if (contentSaving) {
      return;
    }

    setContentModal(null);
    setContentFormError("");
  }

  async function saveContent(event) {
    event.preventDefault();

    try {
      setContentSaving(true);
      setContentFormError("");
      setApiError("");

      if (
        !contentForm.bot_id ||
        !contentForm.title.trim()
      ) {
        throw new Error(
          "Bot and content title are required."
        );
      }

      let metadata = {};

      if (
        contentForm.metadata.trim()
      ) {
        try {
          metadata = JSON.parse(
            contentForm.metadata
          );
        } catch {
          throw new Error(
            "Metadata must be valid JSON."
          );
        }
      }

      const payload = {
        ...contentForm,
        category_id:
          contentForm.category_id ||
          null,
        content_type:
          contentForm.content_type.trim() ||
          "general",
        title:
          contentForm.title.trim(),
        description:
          contentForm.description.trim() ||
          null,
        image_url:
          contentForm.image_url.trim() ||
          null,
        external_url:
          contentForm.external_url.trim() ||
          null,
        metadata,
        published_at:
          contentForm.published_at
            ? new Date(
                contentForm.published_at
              ).toISOString()
            : null
      };

      if (
        contentModal === "create"
      ) {
        await fetchApi(
          "/api/content",
          {
            method: "POST",
            body: JSON.stringify(
              payload
            )
          }
        );
      } else {
        await fetchApi(
          `/api/content/${contentModal.id}`,
          {
            method: "PUT",
            body: JSON.stringify(
              payload
            )
          }
        );
      }

      setContentModal(null);
      await loadDashboard();
    } catch (error) {
      console.error(error);

      setContentFormError(
        error.message ||
          "Unable to save content."
      );
    } finally {
      setContentSaving(false);
    }
  }

  async function toggleContent(item) {
    try {
      setApiError("");

      await fetchApi(
        `/api/content/${item.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            is_active:
              !item.is_active
          })
        }
      );

      await loadDashboard();
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Unable to update content."
      );
    }
  }

  async function toggleUser(user) {
    try {
      setApiError("");

      await fetchApi(
        `/api/users/${user.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            is_active:
              !user.is_active
          })
        }
      );

      const data =
        userBotFilter
          ? await fetchApi(
              `/api/users?bot_id=${encodeURIComponent(
                userBotFilter
              )}`
            )
          : await fetchApi(
              "/api/users"
            );

      setUsers(data || []);
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Unable to update user."
      );
    }
  }

  async function reloadUsers() {
    try {
      setApiError("");

      const data =
        userBotFilter
          ? await fetchApi(
              `/api/users?bot_id=${encodeURIComponent(
                userBotFilter
              )}`
            )
          : await fetchApi(
              "/api/users"
            );

      setUsers(data || []);
    } catch (error) {
      console.error(error);

      setApiError(
        error.message ||
          "Unable to load users."
      );
    }
  }

  if (authLoading) {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <h1>FINDLY ADMIN</h1>
          <p>
            Checking secure session...
          </p>
        </section>
      </div>
    );
  }

  if (recoveryMode) {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <h1>
            Set New Password
          </h1>

          <p>
            Create a new secure
            password for your FINDLY
            Admin account.
          </p>

          <form
            className="auth-form"
            onSubmit={
              handleUpdatePassword
            }
          >
            <FormField
              label="New Password"
              type="password"
              value={newPassword}
              onChange={
                setNewPassword
              }
              placeholder="Enter new password"
              required
            />

            <FormField
              label="Confirm Password"
              type="password"
              value={
                confirmPassword
              }
              onChange={
                setConfirmPassword
              }
              placeholder="Confirm new password"
              required
            />

            <div className="password-requirements">
              <strong>
                Password requirements
              </strong>
              <span>
                • At least 8 characters
              </span>
              <span>
                • Both password fields must match
              </span>
            </div>

            {updatePasswordError && (
              <div className="auth-error">
                {
                  updatePasswordError
                }
              </div>
            )}

            <button
              className="auth-button"
              type="submit"
              disabled={
                updatePasswordLoading
              }
            >
              {updatePasswordLoading
                ? "Updating password..."
                : "Update Password"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <h1>FINDLY ADMIN</h1>

          {!resetMode ? (
            <>
              <p>
                Sign in to access the
                control center.
              </p>

              <form
                className="auth-form"
                onSubmit={handleLogin}
              >
                <FormField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="Enter your email"
                  required
                />

                <FormField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={
                    setPassword
                  }
                  placeholder="Enter your password"
                  required
                />

                {loginError && (
                  <div className="auth-error">
                    {loginError}
                  </div>
                )}

                {resetMessage && (
                  <div className="auth-success">
                    {resetMessage}
                  </div>
                )}

                <button
                  className="auth-button"
                  type="submit"
                  disabled={
                    loginLoading
                  }
                >
                  {loginLoading
                    ? "Signing in..."
                    : "Sign In"}
                </button>

                <button
                  className="auth-link"
                  type="button"
                  onClick={() => {
                    setResetMode(
                      true
                    );
                    setLoginError("");
                    setResetMessage("");
                  }}
                >
                  Forgot Password?
                </button>
              </form>
            </>
          ) : (
            <>
              <p>
                Enter your email and
                we'll send you a secure
                password reset link.
              </p>

              <form
                className="auth-form"
                onSubmit={
                  handlePasswordReset
                }
              >
                <FormField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="Enter your email"
                  required
                />

                {loginError && (
                  <div className="auth-error">
                    {loginError}
                  </div>
                )}

                {resetMessage && (
                  <div className="auth-success">
                    {resetMessage}
                  </div>
                )}

                <button
                  className="auth-button"
                  type="submit"
                  disabled={
                    resetLoading
                  }
                >
                  {resetLoading
                    ? "Sending..."
                    : "Send Reset Email"}
                </button>

                <button
                  className="auth-link"
                  type="button"
                  onClick={() => {
                    setResetMode(
                      false
                    );
                    setLoginError("");
                    setResetMessage("");
                  }}
                >
                  Back to Sign In
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    );
  }

  const activeBots =
    bots.filter(
      (bot) => bot.is_active
    ).length;

  const activeCategories =
    categories.filter(
      (category) =>
        category.is_active
    ).length;

  const activeContent =
    content.filter(
      (item) => item.is_active
    ).length;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            F
          </div>

          <div>
            <strong>FINDLY</strong>
            <span>ADMIN</span>
          </div>
        </div>

        <nav className="admin-navigation" aria-label="Main navigation">
          {menuGroups.map((group) => {
            const expanded = expandedMenuGroup === group.label;
            const groupActive = group.items.includes(activeSection);
            const hasChildren = group.items.length > 1;

            return (
              <div className="nav-group" key={group.label}>
                <button
                  className={"nav-item nav-group-trigger " + (groupActive ? "active" : "")}
                  type="button"
                  aria-expanded={hasChildren ? expanded : undefined}
                  onClick={() => {
                    if (hasChildren) {
                      setExpandedMenuGroup(expanded ? "" : group.label);
                      if (!groupActive) setActiveSection(group.items[0]);
                    } else {
                      setActiveSection(group.items[0]);
                      setExpandedMenuGroup("");
                    }
                  }}
                >
                  <span className="nav-group-icon">{group.icon}</span>
                  <span className="nav-group-label">{group.label}</span>
                  {hasChildren && <span className="nav-group-chevron" aria-hidden="true">{expanded ? "⌄" : "‹"}</span>}
                </button>
                {hasChildren && expanded && (
                  <div className="nav-submenu">
                    {group.items.map((item) => (
                      <button
                        key={item}
                        className={"nav-subitem " + (activeSection === item ? "active" : "")}
                        type="button"
                        aria-current={activeSection === item ? "page" : undefined}
                        onClick={() => setActiveSection(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="owner-badge">
            <span>👑</span>

            <div>
              <strong>
                Owner
              </strong>

              <small>
                Full Access
              </small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div>
            <h1>
              {activeSection}
            </h1>

            <p>
              {getSectionDescription(
                activeSection
              )}
            </p>
          </div>

          <div className="header-actions">
            <button
              className="icon-button"
              type="button"
              onClick={
                loadDashboard
              }
              title="Refresh"
            >
              ↻
            </button>

            <div className="profile">
              <div className="avatar">
                F
              </div>

              <div>
                <strong>
                  FINDLY Owner
                </strong>

                <small>
                  Administrator
                </small>
              </div>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={
                handleLogout
              }
            >
              Logout
            </button>
          </div>
        </header>

        {apiError && (
          <div className="error-box">
            {apiError}
          </div>
        )}

        {loading && (
          <div className="loading-bar">
            Loading dashboard...
          </div>
        )}

        {activeSection ===
          "Overview" && (
          <Overview
            bots={bots}
            categories={
              categories
            }
            users={users}
            content={content}
            activeBots={
              activeBots
            }
            activeCategories={
              activeCategories
            }
            activeContent={
              activeContent
            }
          />
        )}

        {activeSection ===
          "Bots" && (
          <BotsSection
            bots={bots}
            onCreate={
              openCreateBot
            }
            onEdit={
              openEditBot
            }
            onToggle={
              toggleBot
            }
          />
        )}

        {activeSection ===
          "Categories" && (
          <CategoriesSection
            categories={
              categories
            }
            onCreate={
              openCreateCategory
            }
            onEdit={
              openEditCategory
            }
            onToggle={
              toggleCategory
            }
          />
        )}

        {activeSection ===
          "Menus" && (
          <MenusSection
            bots={bots}
            menus={menus}
            selectedBot={
              menuBotFilter
            }
            onBotChange={
              setMenuBotFilter
            }
            onCreate={
              openCreateMenu
            }
            onEdit={
              openEditMenu
            }
            onToggle={
              toggleMenu
            }
          />
        )}

        {activeSection ===
          "Content" && (
          <ContentSection
            bots={bots}
            categories={
              categories
            }
            content={content}
            botFilter={
              contentBotFilter
            }
            categoryFilter={
              contentCategoryFilter
            }
            onBotFilter={
              setContentBotFilter
            }
            onCategoryFilter={
              setContentCategoryFilter
            }
            onCreate={
              openCreateContent
            }
            onEdit={
              openEditContent
            }
            onToggle={
              toggleContent
            }
          />
        )}
        {(activeSection === "Movies" || activeSection === "Publishing & Sharing") && (
          <MoviesSection
            movies={movies}
            bots={bots}
            fetchApi={fetchApi}
            mode={activeSection === "Publishing & Sharing" ? "sharing" : "catalog"}
            onRefresh={async () => setMovies(await fetchApi("/api/movies"))}
          />
        )}
        {activeSection === "Telegram" && (
  <TelegramSection
    bots={bots}
    botSlug={telegramBotSlug}
    onBotChange={selectTelegramBot}
    status={telegramStatus}
    loading={telegramLoading}
    message={telegramMessage}
    error={telegramError}
    webhookInfo={telegramWebhookInfo}
    webhookChecking={telegramWebhookChecking}
    onConnect={connectTelegramWebhook}
    onDisconnect={disconnectTelegramWebhook}
    onCheckWebhook={checkTelegramWebhook}
  />
)}

        {activeSection ===
          "Users" && (
          <UsersSection
            users={users}
            bots={bots}
            selectedBot={
              userBotFilter
            }
            onBotChange={
              async (value) => {
                setUserBotFilter(
                  value
                );

                try {
                  const data =
                    value
                      ? await fetchApi(
                          `/api/users?bot_id=${encodeURIComponent(
                            value
                          )}`
                        )
                      : await fetchApi(
                          "/api/users"
                        );

                  setUsers(
                    data || []
                  );
                } catch (
                  error
                ) {
                  setApiError(
                    error.message ||
                      "Unable to load users."
                  );
                }
              }
            }
            onToggle={
              toggleUser
            }
            onRefresh={
              reloadUsers
            }
          />
        )}

        {activeSection ===
          "Notifications" && (
          <NotificationsSection
            fetchApi={fetchApi}
            bots={bots}
            users={users}
          />
        )}

        {activeSection === "Analytics" && (
          <AnalyticsSection fetchApi={fetchApi} />
        )}

        {activeSection === "Admins" && (
          <AdminsSection
            fetchApi={fetchApi}
            currentUserId={session?.user?.id}
          />
        )}

        {[
          "Monetization",
          "AI",
          "Activity Log",
          "Settings"
        ].includes(activeSection) && (
          <ComingSoonSection section={activeSection} />
        )}
      </main>

      {botModal && (
        <BotModal
          mode={
            botModal === "create"
              ? "create"
              : "edit"
          }
          form={botForm}
          saving={botSaving}
          error={botFormError}
          onChange={(
            field,
            value
          ) =>
            setBotForm(
              (current) => ({
                ...current,
                [field]: value
              })
            )
          }
          onClose={
            closeBotModal
          }
          onSubmit={saveBot}
        />
      )}

      {categoryModal && (
        <CategoryModal
          mode={
            categoryModal ===
            "create"
              ? "create"
              : "edit"
          }
          form={categoryForm}
          saving={
            categorySaving
          }
          error={
            categoryFormError
          }
          onChange={(
            field,
            value
          ) =>
            setCategoryForm(
              (current) => ({
                ...current,
                [field]: value
              })
            )
          }
          onClose={
            closeCategoryModal
          }
          onSubmit={
            saveCategory
          }
        />
      )}

      {menuModal && (
        <MenuModal
          mode={
            menuModal === "create"
              ? "create"
              : "edit"
          }
          form={menuForm}
          bots={bots}
          menus={menus}
          saving={menuSaving}
          error={menuFormError}
          onChange={(
            field,
            value
          ) =>
            setMenuForm(
              (current) => ({
                ...current,
                [field]: value
              })
            )
          }
          onClose={
            closeMenuModal
          }
          onSubmit={saveMenu}
        />
      )}

      {contentModal && (
        <ContentModal
          mode={
            contentModal ===
            "create"
              ? "create"
              : "edit"
          }
          form={contentForm}
          bots={bots}
          categories={
            categories
          }
          saving={
            contentSaving
          }
          error={
            contentFormError
          }
          onChange={(
            field,
            value
          ) =>
            setContentForm(
              (current) => ({
                ...current,
                [field]: value
              })
            )
          }
          onClose={
            closeContentModal
          }
          onSubmit={
            saveContent
          }
        />
      )}
    </div>
  );
}

function getSectionDescription(
  section
) {
  const descriptions = {
    Overview:
      "FINDLY control center",
    Bots:
      "Create and manage FINDLY bots",
    Categories:
      "Manage global content categories",
    Menus:
      "Build bot navigation menus",
    Content:
      "Manage published and unpublished content",
    Users:
      "Manage Telegram users",
    Notifications:
      "Notification management",
    Analytics:
      "Usage and performance analytics",
    Monetization:
      "Revenue and monetization",
    AI:
      "AI configuration",
    Admins:
      "Administrators and permissions",
    "Activity Log":
      "System activity history",
    Settings:
      "FINDLY system settings",
    Telegram:
      "Telegram connection, identity and webhook management",
    "Publishing & Sharing":
      "Publish and share approved movies across connected platforms"
  };

  return (
    descriptions[section] ||
    "FINDLY control center"
  );
}

function Overview({
  bots,
  categories,
  users,
  content,
  activeBots,
  activeCategories,
  activeContent
}) {
  return (
    <>
      <div className="stats">
        <StatCard
          icon="🤖"
          label="Total Bots"
          value={bots.length}
        />

        <StatCard
          icon="🗂️"
          label="Active Categories"
          value={
            activeCategories
          }
        />

        <StatCard
          icon="🗃️"
          label="Active Content"
          value={activeContent}
        />

        <StatCard
          icon="👥"
          label="Telegram Users"
          value={users.length}
        />
      </div>

      <div className="grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>
                FINDLY Bots
              </h2>
              <p>
                Current bot network
              </p>
            </div>
          </div>

          <div className="bot-list">
            {bots.length === 0 ? (
              <div className="empty">
                No bots found.
              </div>
            ) : (
              bots.map((bot) => (
                <div
                  className="bot-row"
                  key={bot.id}
                >
                  <div className="bot-icon">
                    {bot.icon ||
                      "🤖"}
                  </div>

                  <div className="bot-info">
                    <strong>
                      {bot.name}
                    </strong>

                    <span>
                      {bot.slug}
                    </span>
                  </div>

                  <BotStatus
                    bot={bot}
                  />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>
                Categories
              </h2>
              <p>
                Global content structure
              </p>
            </div>
          </div>

          <div className="category-list">
            {categories
              .slice(0, 8)
              .map(
                (category) => (
                  <div
                    className="category-row"
                    key={
                      category.id
                    }
                  >
                    <div className="category-icon">
                      {category.icon ||
                        "📁"}
                    </div>

                    <div>
                      <strong>
                        {
                          category.name
                        }
                      </strong>

                      <small>
                        {
                          category.slug
                        }
                      </small>
                    </div>

                    <span
                      className={
                        category.is_active
                          ? "active-label"
                          : "inactive-label"
                      }
                    >
                      {category.is_active
                        ? "Active"
                        : "Paused"}
                    </span>
                  </div>
                )
              )}

            {categories.length ===
              0 && (
              <div className="empty">
                No categories found.
              </div>
            )}
          </div>
        </section>
      </div>

      <SystemPanel
        bots={bots}
        activeBots={
          activeBots
        }
      />
    </>
  );
}

function BotsSection({
  bots,
  onCreate,
  onEdit,
  onToggle
}) {
  return (
    <>
      <div className="management-toolbar">
        <div>
          <strong>
            Bots Management
          </strong>

          <span>
            {bots.length} bot
            {bots.length === 1
              ? ""
              : "s"}{" "}
            configured
          </span>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={onCreate}
        >
          + Add Bot
        </button>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bot</th>
                <th>Slug</th>
                <th>Type</th>
                <th>Telegram</th>
                <th>Status</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {bots.map((bot) => (
                <tr key={bot.id}>
                  <td>
                    <div className="table-entity">
                      <span className="table-icon">
                        {bot.icon ||
                          "🤖"}
                      </span>

                      <div>
                        <strong>
                          {bot.name}
                        </strong>

                        <small>
                          {bot.description ||
                            "No description"}
                        </small>
                      </div>
                    </div>
                  </td>

                  <td>
                    <code>
                      {bot.slug}
                    </code>
                  </td>

                  <td>
                    <span className="type-badge">
                      {
                        bot.bot_type
                      }
                    </span>
                  </td>

                  <td>
                    {bot.telegram_username ||
                      "—"}
                  </td>

                  <td>
                    <BotStatus
                      bot={bot}
                    />
                  </td>

                  <td>
                    {bot.sort_order}
                  </td>

                  <td>
                    <div className="row-actions">
                      <button
                        className="table-button"
                        type="button"
                        onClick={() =>
                          onEdit(
                            bot
                          )
                        }
                      >
                        Edit
                      </button>

                      <button
                        className="table-button"
                        type="button"
                        onClick={() =>
                          onToggle(
                            bot
                          )
                        }
                      >
                        {bot.is_active
                          ? "Pause"
                          : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {bots.length === 0 && (
            <div className="empty">
              No bots found.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function CategoriesSection({
  categories,
  onCreate,
  onEdit,
  onToggle
}) {
  return (
    <>
      <div className="management-toolbar">
        <div>
          <strong>
            Categories Management
          </strong>

          <span>
            Global categories used
            by FINDLY content.
          </span>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={onCreate}
        >
          + Add Category
        </button>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Slug</th>
                <th>Description</th>
                <th>Status</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {categories.map(
                (category) => (
                  <tr
                    key={
                      category.id
                    }
                  >
                    <td>
                      <div className="table-entity">
                        <span className="table-icon">
                          {category.icon ||
                            "📁"}
                        </span>

                        <strong>
                          {
                            category.name
                          }
                        </strong>
                      </div>
                    </td>

                    <td>
                      <code>
                        {
                          category.slug
                        }
                      </code>
                    </td>

                    <td>
                      {
                        category.description ||
                        "—"
                      }
                    </td>

                    <td>
                      <StatusBadge
                        active={
                          category.is_active
                        }
                      />
                    </td>

                    <td>
                      {
                        category.sort_order
                      }
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="table-button"
                          type="button"
                          onClick={() =>
                            onEdit(
                              category
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="table-button"
                          type="button"
                          onClick={() =>
                            onToggle(
                              category
                            )
                          }
                        >
                          {category.is_active
                            ? "Pause"
                            : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          {categories.length ===
            0 && (
            <div className="empty">
              No categories found.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function MenusSection({
  bots,
  menus,
  selectedBot,
  onBotChange,
  onCreate,
  onEdit,
  onToggle
}) {
  return (
    <>
      <div className="management-toolbar">
        <div>
          <strong>
            Menu Builder
          </strong>

          <span>
            Select a bot to manage
            its menu items.
          </span>
        </div>

        <div className="toolbar-actions">
          <select
            className="toolbar-select"
            value={selectedBot}
            onChange={(event) =>
              onBotChange(
                event.target.value
              )
            }
          >
            <option value="">
              Select bot
            </option>

            {bots.map((bot) => (
              <option
                key={bot.id}
                value={bot.id}
              >
                {bot.icon || "🤖"}{" "}
                {bot.name}
              </option>
            ))}
          </select>

          <button
            className="primary-button"
            type="button"
            onClick={onCreate}
            disabled={!selectedBot}
          >
            + Add Menu Item
          </button>
        </div>
      </div>

      <section className="panel">
        {!selectedBot ? (
          <div className="empty large-empty">
            Select a bot first.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Menu</th>
                  <th>Action</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {menus.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="table-entity">
                        <span className="table-icon">
                          {item.icon ||
                            "🔘"}
                        </span>

                        <div>
                          <strong>
                            {item.label}
                          </strong>

                          {item.parent_id && (
                            <small>
                              Child item
                            </small>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="type-badge">
                        {
                          item.action_type
                        }
                      </span>
                    </td>

                    <td>
                      {
                        item.action_value ||
                        "—"
                      }
                    </td>

                    <td>
                      <StatusBadge
                        active={
                          item.is_active
                        }
                      />
                    </td>

                    <td>
                      {
                        item.sort_order
                      }
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="table-button"
                          type="button"
                          onClick={() =>
                            onEdit(
                              item
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="table-button"
                          type="button"
                          onClick={() =>
                            onToggle(
                              item
                            )
                          }
                        >
                          {item.is_active
                            ? "Pause"
                            : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {menus.length === 0 && (
              <div className="empty">
                No menu items found
                for this bot.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function ContentSection({
  bots,
  categories,
  content,
  botFilter,
  categoryFilter,
  onBotFilter,
  onCategoryFilter,
  onCreate,
  onEdit,
  onToggle
}) {
  const filteredContent =
    content.filter((item) => {
      if (
        botFilter &&
        item.bot_id !== botFilter
      ) {
        return false;
      }

      if (
        categoryFilter &&
        item.category_id !==
          categoryFilter
      ) {
        return false;
      }

      return true;
    });

  return (
    <>
      <div className="management-toolbar">
        <div>
          <strong>
            Content Management
          </strong>

          <span>
            {filteredContent.length}{" "}
            visible item
            {filteredContent.length ===
            1
              ? ""
              : "s"}
          </span>
        </div>

        <div className="toolbar-actions">
          <select
            className="toolbar-select"
            value={botFilter}
            onChange={(event) =>
              onBotFilter(
                event.target.value
              )
            }
          >
            <option value="">
              All bots
            </option>

            {bots.map((bot) => (
              <option
                key={bot.id}
                value={bot.id}
              >
                {bot.name}
              </option>
            ))}
          </select>

          <select
            className="toolbar-select"
            value={categoryFilter}
            onChange={(event) =>
              onCategoryFilter(
                event.target.value
              )
            }
          >
            <option value="">
              All categories
            </option>

            {categories.map(
              (category) => (
                <option
                  key={category.id}
                  value={
                    category.id
                  }
                >
                  {category.name}
                </option>
              )
            )}
          </select>

          <button
            className="primary-button"
            type="button"
            onClick={onCreate}
          >
            + Add Content
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Content</th>
                <th>Bot</th>
                <th>Category</th>
                <th>Type</th>
                <th>Published</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredContent.map(
                (item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="content-title">
                        <strong>
                          {item.title}
                        </strong>

                        <small>
                          {
                            item.description ||
                            "No description"
                          }
                        </small>
                      </div>
                    </td>

                    <td>
                      {
                        bots.find(
                          (bot) =>
                            bot.id ===
                            item.bot_id
                        )?.name ||
                        "Unknown"
                      }
                    </td>

                    <td>
                      {getCategoryNameLocal(
                        categories,
                        item.category_id
                      )}
                    </td>

                    <td>
                      <span className="type-badge">
                        {
                          item.content_type
                        }
                      </span>
                    </td>

                    <td>
                      {item.published_at
                        ? formatDate(
                            item.published_at
                          )
                        : "Draft"}
                    </td>

                    <td>
                      <StatusBadge
                        active={
                          item.is_active
                        }
                      />
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="table-button"
                          type="button"
                          onClick={() =>
                            onEdit(
                              item
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="table-button"
                          type="button"
                          onClick={() =>
                            onToggle(
                              item
                            )
                          }
                        >
                          {item.is_active
                            ? "Deactivate"
                            : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          {filteredContent.length ===
            0 && (
            <div className="empty">
              No content found.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function UsersSection({
  users,
  bots,
  selectedBot,
  onBotChange,
  onToggle,
  onRefresh
}) {
  return (
    <>
      <div className="management-toolbar">
        <div>
          <strong>
            Telegram Users
          </strong>

          <span>
            {users.length} user
            {users.length === 1
              ? ""
              : "s"} loaded
          </span>
        </div>

        <div className="toolbar-actions">
          <select
            className="toolbar-select"
            value={selectedBot}
            onChange={(event) =>
              onBotChange(
                event.target.value
              )
            }
          >
            <option value="">
              All bots
            </option>

            {bots.map((bot) => (
              <option
                key={bot.id}
                value={bot.id}
              >
                {bot.name}
              </option>
            ))}
          </select>

          <button
            className="secondary-button"
            type="button"
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Telegram ID</th>
                <th>User</th>
                <th>Language</th>
                <th>First Seen</th>
                <th>Last Seen</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <code>
                      {
                        user.telegram_user_id
                      }
                    </code>
                  </td>

                  <td>
                    <div className="content-title">
                      <strong>
                        {user.username
                          ? `@${user.username}`
                          : [
                              user.first_name,
                              user.last_name
                            ]
                              .filter(
                                Boolean
                              )
                              .join(
                                " "
                              ) ||
                            "Unknown user"}
                      </strong>

                      <small>
                        {user.first_name ||
                          "No first name"}
                      </small>
                    </div>
                  </td>

                  <td>
                    {
                      user.language_code ||
                      "—"
                    }
                  </td>

                  <td>
                    {formatDate(
                      user.first_seen_at
                    )}
                  </td>

                  <td>
                    {formatDate(
                      user.last_seen_at
                    )}
                  </td>

                  <td>
                    <StatusBadge
                      active={
                        user.is_active
                      }
                    />
                  </td>

                  <td>
                    <button
                      className="table-button"
                      type="button"
                      onClick={() =>
                        onToggle(
                          user
                        )
                      }
                    >
                      {user.is_active
                        ? "Deactivate"
                        : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="empty">
              No users found.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function BotModal({
  mode,
  form,
  saving,
  error,
  onChange,
  onClose,
  onSubmit
}) {
  return (
    <Modal
      title={
        mode === "create"
          ? "Create Bot"
          : "Edit Bot"
      }
      subtitle={
        mode === "create"
          ? "Add a new FINDLY bot."
          : "Update this bot configuration."
      }
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={onSubmit}
      >
        <div className="form-grid">
          <FormField
            label="Name"
            value={form.name}
            onChange={(value) =>
              onChange(
                "name",
                value
              )
            }
            placeholder="FINDLY Movies"
            required
          />

          <FormField
            label="Slug"
            value={form.slug}
            onChange={(value) =>
              onChange(
                "slug",
                value
              )
            }
            placeholder="movies"
            required
          />

          <FormField
            label="Bot Type"
            value={form.bot_type}
            onChange={(value) =>
              onChange(
                "bot_type",
                value
              )
            }
            placeholder="child"
            required
          />

          <FormField
            label="Telegram Username"
            value={
              form.telegram_username
            }
            onChange={(value) =>
              onChange(
                "telegram_username",
                value
              )
            }
            placeholder="@FindlyMoviesBot"
          />

          <FormField
            label="Icon"
            value={form.icon}
            onChange={(value) =>
              onChange(
                "icon",
                value
              )
            }
            placeholder="🎬"
          />

          <FormField
            label="Sort Order"
            type="number"
            value={form.sort_order}
            onChange={(value) =>
              onChange(
                "sort_order",
                value
              )
            }
            placeholder="0"
          />
        </div>

        <FormField
          label="Description"
          value={
            form.description
          }
          onChange={(value) =>
            onChange(
              "description",
              value
            )
          }
          placeholder="What this bot does..."
          textarea
        />

        <CheckboxField
          checked={
            form.is_active
          }
          onChange={(value) =>
            onChange(
              "is_active",
              value
            )
          }
          label="Bot is active"
        />

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <ModalActions
          saving={saving}
          onClose={onClose}
          submitLabel={
            mode === "create"
              ? "Create Bot"
              : "Save Changes"
          }
        />
      </form>
    </Modal>
  );
}

function CategoryModal({
  mode,
  form,
  saving,
  error,
  onChange,
  onClose,
  onSubmit
}) {
  return (
    <Modal
      title={
        mode === "create"
          ? "Create Category"
          : "Edit Category"
      }
      subtitle="Manage a global FINDLY category."
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={onSubmit}
      >
        <div className="form-grid">
          <FormField
            label="Name"
            value={form.name}
            onChange={(value) =>
              onChange(
                "name",
                value
              )
            }
            placeholder="Movies"
            required
          />

          <FormField
            label="Slug"
            value={form.slug}
            onChange={(value) =>
              onChange(
                "slug",
                value
              )
            }
            placeholder="movies"
            required
          />

          <FormField
            label="Icon"
            value={form.icon}
            onChange={(value) =>
              onChange(
                "icon",
                value
              )
            }
            placeholder="🎬"
          />

          <FormField
            label="Sort Order"
            type="number"
            value={form.sort_order}
            onChange={(value) =>
              onChange(
                "sort_order",
                value
              )
            }
            placeholder="0"
          />
        </div>

        <FormField
          label="Description"
          value={
            form.description
          }
          onChange={(value) =>
            onChange(
              "description",
              value
            )
          }
          placeholder="Category description..."
          textarea
        />

        <CheckboxField
          checked={
            form.is_active
          }
          onChange={(value) =>
            onChange(
              "is_active",
              value
            )
          }
          label="Category is active"
        />

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <ModalActions
          saving={saving}
          onClose={onClose}
          submitLabel={
            mode === "create"
              ? "Create Category"
              : "Save Changes"
          }
        />
      </form>
    </Modal>
  );
}

function MenuModal({
  mode,
  form,
  bots,
  menus,
  saving,
  error,
  onChange,
  onClose,
  onSubmit
}) {
  const parentOptions =
    menus.filter(
      (item) =>
        item.id !==
        form.id &&
        item.bot_id ===
          form.bot_id &&
        !item.parent_id
    );

  return (
    <Modal
      title={
        mode === "create"
          ? "Create Menu Item"
          : "Edit Menu Item"
      }
      subtitle="Build the Telegram bot navigation."
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={onSubmit}
      >
        <div className="form-grid">
          <div className="auth-field">
            <label>
              Bot
            </label>

            <select
              value={form.bot_id}
              onChange={(event) =>
                onChange(
                  "bot_id",
                  event.target.value
                )
              }
              required
            >
              <option value="">
                Select bot
              </option>

              {bots.map((bot) => (
                <option
                  key={bot.id}
                  value={bot.id}
                >
                  {bot.name}
                </option>
              ))}
            </select>
          </div>

          <FormField
            label="Label"
            value={form.label}
            onChange={(value) =>
              onChange(
                "label",
                value
              )
            }
            placeholder="🎬 Movies"
            required
          />

          <FormField
            label="Icon"
            value={form.icon}
            onChange={(value) =>
              onChange(
                "icon",
                value
              )
            }
            placeholder="🎬"
          />

          <div className="auth-field">
            <label>
              Parent Item
            </label>

            <select
              value={
                form.parent_id
              }
              onChange={(event) =>
                onChange(
                  "parent_id",
                  event.target.value
                )
              }
            >
              <option value="">
                Root menu item
              </option>

              {parentOptions.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.icon ||
                      "🔘"}{" "}
                    {item.label}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="auth-field">
            <label>
              Action Type
            </label>

            <select
              value={
                form.action_type
              }
              onChange={(event) =>
                onChange(
                  "action_type",
                  event.target.value
                )
              }
            >
              <option value="category">
                category
              </option>
              <option value="bot">
                bot
              </option>
              <option value="url">
                url
              </option>
              <option value="command">
                command
              </option>
              <option value="callback">
                callback
              </option>
              <option value="external">
                external
              </option>
            </select>
          </div>

          <FormField
            label="Action Value"
            value={
              form.action_value
            }
            onChange={(value) =>
              onChange(
                "action_value",
                value
              )
            }
            placeholder="movies"
          />

          <FormField
            label="Sort Order"
            type="number"
            value={
              form.sort_order
            }
            onChange={(value) =>
              onChange(
                "sort_order",
                value
              )
            }
            placeholder="0"
          />
        </div>

        <CheckboxField
          checked={
            form.is_active
          }
          onChange={(value) =>
            onChange(
              "is_active",
              value
            )
          }
          label="Menu item is active"
        />

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <ModalActions
          saving={saving}
          onClose={onClose}
          submitLabel={
            mode === "create"
              ? "Create Menu Item"
              : "Save Changes"
          }
        />
      </form>
    </Modal>
  );
}

function ContentModal({
  mode,
  form,
  bots,
  categories,
  saving,
  error,
  onChange,
  onClose,
  onSubmit
}) {
  return (
    <Modal
      title={
        mode === "create"
          ? "Create Content"
          : "Edit Content"
      }
      subtitle="Create and manage FINDLY content."
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={onSubmit}
      >
        <div className="form-grid">
          <div className="auth-field">
            <label>
              Bot
            </label>

            <select
              value={form.bot_id}
              onChange={(event) =>
                onChange(
                  "bot_id",
                  event.target.value
                )
              }
              required
            >
              <option value="">
                Select bot
              </option>

              {bots.map((bot) => (
                <option
                  key={bot.id}
                  value={bot.id}
                >
                  {bot.name}
                </option>
              ))}
            </select>
          </div>

          <div className="auth-field">
            <label>
              Category
            </label>

            <select
              value={
                form.category_id
              }
              onChange={(event) =>
                onChange(
                  "category_id",
                  event.target.value
                )
              }
            >
              <option value="">
                No category
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category.id}
                    value={
                      category.id
                    }
                  >
                    {category.icon ||
                      "📁"}{" "}
                    {category.name}
                  </option>
                )
              )}
            </select>
          </div>

          <FormField
            label="Content Type"
            value={
              form.content_type
            }
            onChange={(value) =>
              onChange(
                "content_type",
                value
              )
            }
            placeholder="general"
          />

          <FormField
            label="Title"
            value={form.title}
            onChange={(value) =>
              onChange(
                "title",
                value
              )
            }
            placeholder="Content title"
            required
          />

          <FormField
            label="Image URL"
            value={
              form.image_url
            }
            onChange={(value) =>
              onChange(
                "image_url",
                value
              )
            }
            placeholder="https://..."
          />

          <FormField
            label="External URL"
            value={
              form.external_url
            }
            onChange={(value) =>
              onChange(
                "external_url",
                value
              )
            }
            placeholder="https://..."
          />

          <FormField
            label="Published At"
            type="datetime-local"
            value={
              form.published_at
            }
            onChange={(value) =>
              onChange(
                "published_at",
                value
              )
            }
          />
        </div>

        <FormField
          label="Description"
          value={
            form.description
          }
          onChange={(value) =>
            onChange(
              "description",
              value
            )
          }
          placeholder="Content description..."
          textarea
        />

        <FormField
          label="Metadata JSON"
          value={
            form.metadata
          }
          onChange={(value) =>
            onChange(
              "metadata",
              value
            )
          }
          placeholder='{"source":"telegram"}'
          textarea
        />

        <CheckboxField
          checked={
            form.is_active
          }
          onChange={(value) =>
            onChange(
              "is_active",
              value
            )
          }
          label="Content is active"
        />

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <ModalActions
          saving={saving}
          onClose={onClose}
          submitLabel={
            mode === "create"
              ? "Create Content"
              : "Save Changes"
          }
        />
      </form>
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button
            className="modal-close"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function ModalActions({
  saving,
  onClose,
  submitLabel
}) {
  return (
    <div className="modal-actions">
      <button
        className="secondary-button"
        type="button"
        onClick={onClose}
        disabled={saving}
      >
        Cancel
      </button>

      <button
        className="primary-button"
        type="submit"
        disabled={saving}
      >
        {saving
          ? "Saving..."
          : submitLabel}
      </button>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  textarea = false
}) {
  return (
    <div className="auth-field">
      <label>
        {label}
      </label>

      {textarea ? (
        <textarea
          value={value ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            placeholder
          }
          rows={5}
          required={required}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            placeholder
          }
          required={required}
        />
      )}
    </div>
  );
}

function CheckboxField({
  checked,
  onChange,
  label
}) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked
          )
        }
      />

      <span>{label}</span>
    </label>
  );
}

function BotStatus({ bot }) {
  return (
    <StatusBadge
      active={bot.is_active}
    />
  );
}

function StatusBadge({
  active
}) {
  return (
    <div
      className={
        "status " +
        (active
          ? "online"
          : "offline")
      }
    >
      <span />
      {active
        ? "Active"
        : "Paused"}
    </div>
  );
}

function MoviesSection({ movies, bots = [], fetchApi, onRefresh, mode = "catalog" }) {
  const [editing,setEditing]=useState(null),[form,setForm]=useState(null),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const [filter,setFilter]=useState("all"),[tmdbQuery,setTmdbQuery]=useState(""),[tmdbType,setTmdbType]=useState("movie"),[tmdbResults,setTmdbResults]=useState([]),[tmdbLoading,setTmdbLoading]=useState(false),[importingId,setImportingId]=useState(null);
  const [shareStatus,setShareStatus]=useState("");
  async function shareMovie(item, platform) {
    setShareStatus("");
    setError("");
    try {
      const moviesBot = bots.find((bot) => bot.slug === "movies" && bot.is_active);
      const share = buildMovieShareContent(
        item,
        moviesBot?.telegram_username,
        platform,
        API_URL
      );

      if (platform === "facebook") {
        // Facebook's composer does not reliably display og:description in every
        // Feed layout. Copy the same database-backed movie caption first, then
        // open the canonical share page so the user can paste it into the post.
        const clipboardPromise = navigator.clipboard?.writeText
          ? navigator.clipboard.writeText(share.caption).then(() => true).catch(() => false)
          : Promise.resolve(false);

        window.open(
          share.facebookShareUrl,
          "_blank",
          "noopener,noreferrer"
        );

        const copied = await clipboardPromise;
        setShareStatus(
          copied
            ? "نسخنا تلقائياً نص الفيلم من مكتبة FINDLY. فـ Facebook لسق النص فخانة «Quoi de neuf ?»؛ الصورة والعنوان كيجيو من بطاقة الرابط."
            : "تحلات مشاركة Facebook. إذا ما بانش الملخص فالبطاقة، انسخ نص الفيلم من FINDLY أو فعّل صلاحية Clipboard ثم عاود المشاركة."
        );
        return;
      }

      const response = await fetch(share.posterDownloadUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error("ما قدرناش نجيبو صورة الفيلم. ما غاديش نرسل مشاركة ناقصة.");
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || !blob.size) {
        throw new Error("ملف صورة الفيلم غير صالح للمشاركة.");
      }
      const safeName = (item.title || "findly-movie")
        .replace(/[^a-z0-9-_]/gi, "-")
        .slice(0, 70);
      const file = new File(
        [blob],
        safeName + ".jpg",
        { type: blob.type || "image/jpeg" }
      );

      const clipboardPromise = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(share.caption).catch(() => false)
        : Promise.resolve(false);

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: item.title,
            text: share.caption,
            files: [file]
          });
          setShareStatus(
            "تجهزات صورة الفيلم والنص للمشاركة. اختار Instagram من القائمة. إذا التطبيق ما نقلش النص، راه نسخناه باش تلصقو."
          );
          await clipboardPromise;
          return;
        } catch (shareError) {
          if (shareError?.name === "AbortError") {
            setShareStatus("تلغات المشاركة. النص بقى منسوخ والصورة واجدة للتحميل.");
            await clipboardPromise;
            downloadPosterBlob(blob, safeName);
            return;
          }
          if (shareError?.name !== "NotAllowedError" && shareError?.name !== "DataError") {
            throw shareError;
          }
        }
      }

      await clipboardPromise;
      downloadPosterBlob(blob, safeName);
      setShareStatus(
        "حمّلنا صورة الفيلم ونسخنا النص. افتح Instagram، اختار الصورة من Gallery، ولسق النص فالوصف."
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        setShareStatus("تم إلغاء المشاركة.");
        return;
      }
      setError(error?.message || "تعذر تجهيز مشاركة الفيلم.");
    }
  }

  function downloadPosterBlob(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName + ".jpg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  const visible=movies.filter(item=>mode === "sharing" ? item.status === "active" : filter==="all"||item.status===filter);
  async function searchTmdb(event){event.preventDefault();if(!tmdbQuery.trim())return;setTmdbLoading(true);setError("");try{const params=new URLSearchParams({query:tmdbQuery.trim(),media_type:tmdbType});setTmdbResults(await fetchApi("/api/movies/tmdb/search?"+params.toString()));}catch(e){setError(e.message||"TMDB search failed");}finally{setTmdbLoading(false);}}
  function edit(item){setEditing(item.id);setForm({title:item.title||"",overview:item.overview||"",full_plot_summary:item.full_plot_summary||""});setError("");}
  async function importTmdb(item){setImportingId(item.tmdb_id);setError("");try{const imported=await fetchApi("/api/movies/tmdb/import",{method:"POST",body:JSON.stringify({tmdb_id:item.tmdb_id,media_type:item.media_type})});setTmdbResults(results=>results.filter(result=>result.tmdb_id!==item.tmdb_id));await onRefresh();edit(imported);}catch(e){setError(e.message||"TMDB import failed");}finally{setImportingId(null);}}
  async function save(event){event.preventDefault();if(!editing||!form)return;setSaving(true);setError("");try{await fetchApi("/api/movies/"+editing,{method:"PUT",body:JSON.stringify({overview:form.overview,full_plot_summary:form.full_plot_summary})});setEditing(null);setForm(null);await onRefresh();}catch(e){setError(e.message||"Unable to save synopsis");}finally{setSaving(false);}}
  async function changeStatus(item,status){try{await fetchApi("/api/movies/"+item.id,{method:"PUT",body:JSON.stringify({status})});await onRefresh();}catch(e){setError(e.message||"Unable to update movie");}}
  async function remove(item){if(!window.confirm("Delete this catalog entry permanently?"))return;try{await fetchApi("/api/movies/"+item.id,{method:"DELETE"});await onRefresh();}catch(e){setError(e.message||"Unable to delete movie");}}
  return <section className="panel movies-workspace" aria-labelledby="movies-workspace-title">
    <header className="movies-workspace-heading"><div><span className="movies-workspace-eyebrow">{mode === "sharing" ? "FINDLY PUBLISHING" : "FINDLY MASTER LIBRARY"}</span><h2 id="movies-workspace-title">{mode === "sharing" ? "Publishing & Sharing" : "Movies catalog"}</h2><p>{mode === "sharing" ? "اختار فيلماً منشوراً وشاركو باستعمال نفس بيانات مكتبة FINDLY على Facebook أو Instagram." : "كتب اسم الفيلم أو المسلسل، اختار النتيجة، وFINDLY غادي يعمر المعلومات ويحفظها كمسودة."}</p></div><div className="movies-title-count"><strong>{mode === "sharing" ? visible.length : movies.length}</strong><span>{mode === "sharing" ? "أفلام جاهزة للمشاركة" : "عناوين فالمكتبة"}</span></div></header>
    {error&&<div className="auth-error movies-workspace-error" role="alert">{error}</div>}
    {shareStatus&&<div className="auth-success movies-share-status" role="status">{shareStatus}</div>}
    {mode !== "sharing" && <form className="movies-card tmdb-import-card" onSubmit={searchTmdb}>
      <div className="movies-card-heading"><div><h3>إضافة فيلم أو مسلسل</h3><p>TMDB كيجلب المعلومات تلقائياً. الاختيار كيتسجل Draft وما كينشرش مباشرة.</p></div><span className="movies-card-step">01</span></div>
      <div className="tmdb-search-row">
        <label className="movies-field"><span>النوع</span><select className="toolbar-select" value={tmdbType} onChange={e=>setTmdbType(e.target.value)}><option value="movie">فيلم</option><option value="series">مسلسل</option></select></label>
        <label className="movies-field tmdb-query-field"><span>اسم الفيلم أو المسلسل</span><input aria-label="Search movie or series title" placeholder="مثلاً: Interstellar" value={tmdbQuery} onChange={e=>setTmdbQuery(e.target.value)}/></label>
        <button className="primary-button tmdb-search-button" disabled={tmdbLoading||!tmdbQuery.trim()}>{tmdbLoading?"كنقلب...":"بحث"}</button>
      </div>
    </form>}
    {mode !== "sharing" && tmdbResults.length>0&&<div className="movies-card tmdb-results-card"><div className="movies-card-heading"><div><h3>نتائج البحث</h3><p>اختار العنوان الصحيح باش يتزاد للمكتبة كمسودة.</p></div></div><div className="table-wrap movies-table-wrap"><table className="movies-table"><thead><tr><th>الصورة</th><th>العنوان</th><th>السنة</th><th>التقييم</th><th>إضافة</th></tr></thead><tbody>{tmdbResults.map(item=><tr key={item.tmdb_id}><td>{item.poster_path?<img src={item.poster_path} alt="" loading="lazy"/>:"—"}</td><td><strong>{item.title}</strong><small>{item.original_title||""}</small></td><td>{item.release_year||"—"}</td><td>{item.rating??"—"}</td><td><button className="secondary-button" type="button" disabled={importingId===item.tmdb_id} onClick={()=>importTmdb(item)}>{importingId===item.tmdb_id?"كنضيف...":"إضافة للمكتبة"}</button></td></tr>)}</tbody></table></div></div>}
    {mode !== "sharing" && editing&&form&&<form className="movies-card movie-editor-card" onSubmit={save}><div className="movies-card-heading"><div><h3>مراجعة الملخصات</h3><p><strong>{form.title}</strong> — المعلومات الأساسية والصور جابها TMDB.</p></div><span className="movies-card-step">02</span></div><div className="movies-form-grid">
      <label className="movies-field movies-field-wide">Short Synopsis — الملخص القصير<textarea rows="4" value={form.overview} onChange={e=>setForm({...form,overview:e.target.value})} placeholder="ملخص قصير يظهر مباشرة في تفاصيل الفيلم..."/><small>هاد الملخص هو اللي كيبان للمستخدم مباشرة.</small></label>
      <label className="movies-field movies-field-wide">Full Plot Summary — الملخص المفصل<textarea rows="8" value={form.full_plot_summary} onChange={e=>setForm({...form,full_plot_summary:e.target.value})} placeholder="اختياري: أضف ملخصاً مفصلاً من مصدر عندك الحق في استعماله..."/><small>اختياري. ما كيبانش للمستخدم حتى يضغط على «الملخص الكامل» داخل Telegram.</small></label>
    </div><div className="movies-form-actions"><button className="primary-button" disabled={saving}>{saving?"كنحفظ...":"حفظ الملخصات"}</button><button type="button" className="secondary-button" onClick={()=>{setEditing(null);setForm(null);}}>إغلاق</button></div></form>}
    <section className="movies-card movies-catalog-card" aria-labelledby="movies-catalog-title"><div className="movies-catalog-toolbar"><div><h3 id="movies-catalog-title">{mode === "sharing" ? "الأفلام المنشورة" : "مكتبة FINDLY"}</h3><p>{mode === "sharing" ? "المشاركة متاحة فقط للعناوين المنشورة." : "راجع العناوين، عدّل الملخصات، وتحكم في النشر."}</p></div><div className="movies-catalog-controls">{mode !== "sharing" && <label className="movies-field movies-filter-field"><span>الحالة</span><select className="toolbar-select" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">الكل</option><option value="draft">مسودة</option><option value="active">منشور</option><option value="inactive">متوقف</option></select></label>}<button className="secondary-button" type="button" onClick={onRefresh}>تحديث</button></div></div>
      <div className="table-wrap movies-table-wrap"><table className="movies-table"><thead><tr><th>العنوان</th><th>النوع</th><th>السنة</th><th>التقييم</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{visible.map(item=><tr key={item.id}><td><strong>{item.title}</strong><small>{item.original_title||""}</small></td><td>{item.media_type==="series"?"مسلسل":"فيلم"}</td><td>{item.release_year||"—"}</td><td>{item.rating??"—"}</td><td><span className={"movies-status status-"+item.status}>{item.status==="active"?"منشور":item.status==="draft"?"مسودة":"متوقف"}</span></td><td><div className="movies-row-actions">{mode !== "sharing" && <><button className="secondary-button" type="button" onClick={()=>edit(item)}>الملخصات</button>{item.status!=="active"&&<button className="secondary-button" type="button" onClick={()=>changeStatus(item,"active")}>نشر</button>}{item.status!=="inactive"&&<button className="secondary-button" type="button" onClick={()=>changeStatus(item,"inactive")}>إيقاف</button>}<button className="secondary-button" type="button" onClick={()=>remove(item)}>حذف</button></>}{mode === "sharing" && item.status==="active"&&<><button className="secondary-button" type="button" onClick={()=>shareMovie(item,"facebook")}>Facebook</button><button className="secondary-button" type="button" onClick={()=>shareMovie(item,"instagram")}>Instagram</button></>}</div></td></tr>)}{!visible.length&&<tr><td className="movies-empty-state" colSpan="6">{mode === "sharing" ? "ما كاين حتى فيلم منشور جاهز للمشاركة حالياً." : "المكتبة فارغة حالياً. كتب اسم فيلم أو مسلسل في خانة البحث أعلاه."}</td></tr>}</tbody></table></div>
    </section>
  </section>;
}
function TelegramSection({
  bots,
  botSlug,
  onBotChange,
  status,
  loading,
  message,
  error,
  webhookInfo,
  webhookChecking,
  onConnect,
  onDisconnect,
  onCheckWebhook
}) {
  const selectedBot = bots.find((bot) => bot.slug === botSlug);

  return (
    <section className="panel telegram-panel">
      <div className="panel-header">
        <div>
          <h2>Telegram</h2>
          <p>Verify bot identity and manage each Telegram webhook independently.</p>
        </div>
        <div className={"telegram-status " + (status === "Connected" ? "connected" : status === "Identity mismatch" ? "failed" : "disconnected")}>
          <span />
          {status}
        </div>
      </div>

      <div className="management-toolbar">
        <div>
          <strong>Select Telegram bot</strong>
          <span>Each bot uses its own token and webhook route.</span>
        </div>
        <select className="toolbar-select" value={botSlug} onChange={(event) => onBotChange(event.target.value)}>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.slug}>{bot.name} ({bot.slug})</option>
          ))}
        </select>
      </div>

      <div className="telegram-card">
        <div className="telegram-bot">
          <div className="telegram-bot-icon">🤖</div>
          <div>
            <strong>{selectedBot?.name || "Telegram bot"}</strong>
            <span>{selectedBot?.telegram_username ? "@" + selectedBot.telegram_username.replace(/^@/, "") : "Username not configured"}</span>
          </div>
        </div>

        <div className="telegram-info-grid">
          <div><small>Bot role</small><strong>{selectedBot?.bot_type === "master" ? "Master" : "Child bot"}</strong></div>
          <div><small>Webhook endpoint</small><strong>/telegram/{botSlug}</strong></div>
          <div><small>Backend</small><strong>Existing Cloudflare Worker</strong></div>
        </div>

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        {webhookInfo?.identity && (
          <div className="telegram-info-grid">
            <div><small>Telegram getMe identity</small><strong>{webhookInfo.identity.identity?.username ? "@" + webhookInfo.identity.identity.username : "Not verified"}</strong></div>
            <div><small>Configured username match</small><strong>{webhookInfo.identity.matches_configured_username ? "Verified" : "Mismatch / pending"}</strong></div>
            <div><small>Telegram bot ID</small><strong>{webhookInfo.identity.identity?.id || "—"}</strong></div>
            <div><small>Webhook status</small><strong>{webhookInfo.url ? "Active" : "Not configured"}</strong></div>
            <div><small>Pending updates</small><strong>{Number.isFinite(webhookInfo.pending_update_count) ? webhookInfo.pending_update_count : "—"}</strong></div>
            <div><small>Last Telegram error</small><strong>{webhookInfo.last_error_message || "None"}</strong></div>
          </div>
        )}

        <div className="telegram-actions">
          <button className="primary-button" type="button" onClick={status === "Connected" ? onCheckWebhook : onConnect} disabled={loading || webhookChecking}>
            {loading ? "Connecting..." : webhookChecking ? "Checking..." : status === "Connected" ? "Refresh Status" : "Verify Identity & Connect"}
          </button>
          <button className="secondary-button" type="button" onClick={onCheckWebhook} disabled={loading || webhookChecking}>
            {webhookChecking ? "Checking..." : "Check Identity / Webhook"}
          </button>
          <button className="secondary-button" type="button" onClick={onDisconnect} disabled={loading || webhookChecking}>
            Disconnect Webhook
          </button>
        </div>
      </div>
    </section>
  );
}

function SystemPanel({
  bots,
  activeBots
}) {
  return (
    <section className="panel system-panel">
      <div className="panel-header">
        <div>
          <h2>
            System Status
          </h2>

          <p>
            Current FINDLY infrastructure
          </p>
        </div>
      </div>

      <div className="system-grid">
        <SystemItem
          label="Cloudflare API"
          value="Connected"
        />

        <SystemItem
          label="Supabase"
          value="Connected"
        />

        <SystemItem
          label="Database"
          value="Connected"
        />

        <SystemItem
          label="Active Bots"
          value={`${activeBots}/${bots.length}`}
        />
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <strong>
          {value}
        </strong>
      </div>
    </div>
  );
}

function SystemItem({
  label,
  value
}) {
  return (
    <div className="system-item">
      <div>
        <strong>
          {label}
        </strong>

        <small>
          {value}
        </small>
      </div>

      <span className="system-dot" />
    </div>
  );
}

function ComingSoonSection({
  section
}) {
  return (
    <section className="panel coming-soon">
      <div className="coming-icon">
        ⚙️
      </div>

      <h2>
        {section}
      </h2>

      <p>
        This module is reserved for
        the next implementation batch.
      </p>
    </section>
  );
}

function getCategoryNameLocal(
  categories,
  categoryId
) {
  if (!categoryId) {
    return "No category";
  }

  return (
    categories.find(
      (category) =>
        category.id === categoryId
    )?.name || "Unknown"
  );
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString();
}

export default App;
