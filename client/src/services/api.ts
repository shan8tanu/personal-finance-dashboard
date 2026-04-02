const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  // Transactions
  getTransactions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/transactions?${qs}`);
  },
  getTransactionSummary: (month: number, year: number) =>
    request(`/transactions/summary?month=${month}&year=${year}`),
  updateTransaction: (id: string, data: any) =>
    request(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) =>
    request(`/transactions/${id}`, { method: "DELETE" }),

  // Categories
  getCategories: () => request("/categories"),
  createCategory: (data: any) =>
    request("/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) =>
    request(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request(`/categories/${id}`, { method: "DELETE" }),

  // Tagging Rules
  getTaggingRules: () => request("/tagging-rules"),
  createTaggingRule: (data: any) =>
    request("/tagging-rules", { method: "POST", body: JSON.stringify(data) }),
  updateTaggingRule: (id: string, data: any) =>
    request(`/tagging-rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTaggingRule: (id: string) =>
    request(`/tagging-rules/${id}`, { method: "DELETE" }),
  applyTaggingRules: () =>
    request("/tagging-rules/apply", { method: "POST" }),
  previewTaggingRule: (data: any) =>
    request("/tagging-rules/preview", { method: "POST", body: JSON.stringify(data) }),

  // Credit Card
  getCreditCardStatements: () => request("/credit-card/statements"),
  getCreditCardTransactions: (statementId: string) =>
    request(`/credit-card/statements/${statementId}/transactions`),
  getCreditCardSummary: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/credit-card/summary?${qs}`);
  },

  // Analytics
  getCategoryBreakdown: (month: number, year: number, accountId?: string) => {
    let url = `/analytics/category-breakdown?month=${month}&year=${year}`;
    if (accountId) url += `&accountId=${accountId}`;
    return request(url);
  },
  getMonthlyTrend: (months: number = 6) =>
    request(`/analytics/monthly-trend?months=${months}`),

  // Upload
  uploadBankStatement: (file: File, password?: string, accountId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (password) formData.append("password", password);
    if (accountId) formData.append("accountId", accountId);
    return request("/upload/bank-statement", { method: "POST", body: formData });
  },
  uploadCreditCardStatement: (file: File, accountId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (accountId) formData.append("accountId", accountId);
    return request("/upload/credit-card-statement", { method: "POST", body: formData });
  },
};
