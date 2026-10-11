"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CheckCheck,
  ChevronRight,
  Clock3,
  Plus,
  Receipt,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  ORDER_STATUS_LABELS,
  OrderItemsList,
} from "@/components/admin/OrderItemsList";
import {
  orderCustomerLabel,
  orderTicket,
  fulfillmentLabel,
} from "@/lib/orderCustomer";
import {
  ACTIVE_ORDER_STATUSES,
  CAFE_TIME_ZONE,
  cafeDay,
  dashboardPeriod,
  fetchAdminJson,
  fetchAdminOrders,
  orderMetrics,
} from "@/lib/adminDashboard";

const money = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) +
  " ₽";
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: CAFE_TIME_ZONE,
    ...options,
  }).format(new Date(value));
const periods = [
  { label: "Сегодня", days: 1 },
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
];
const quickActions = [
  {
    label: "Открыть кассу",
    description: "Бонусы и лояльность",
    href: "/admin/loyalty",
    icon: ScanLine,
  },
  {
    label: "Добавить товар",
    description: "Новая позиция в меню",
    href: "/admin/products/new",
    icon: Plus,
  },
  {
    label: "Управлять меню",
    description: "Цены и доступность",
    href: "/admin/products",
    icon: UtensilsCrossed,
  },
];

export default function AdminDashboard() {
  const [days, setDays] = useState(1);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [search, setSearch] = useState("");
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const ordersQuery = useQuery({
    queryKey: ["admin-orders"],
    queryFn: fetchAdminOrders,
    refetchInterval: 10_000,
  });
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () =>
      fetchAdminJson<{ users: { id: string }[] }>("/api/admin/users"),
  });
  const productsQuery = useQuery({
    queryKey: ["admin-products"],
    queryFn: () =>
      fetchAdminJson<{ products: { id: string; isAvailable: boolean }[] }>(
        "/api/admin/products",
      ),
  });
  const orders = ordersQuery.data?.orders ?? [];
  const today = cafeDay(clock);
  const period = dashboardPeriod(days, clock);
  const periodOrders = orders.filter((order) =>
    period.includes(cafeDay(order.createdAt)),
  );
  const metrics = orderMetrics(periodOrders);
  const previousEnd = new Date(`${period[0]}T12:00:00Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousPeriod = dashboardPeriod(days, previousEnd);
  const previousMetrics = orderMetrics(
    orders.filter((order) => previousPeriod.includes(cafeDay(order.createdAt))),
  );
  // A partial current day is not comparable to a full yesterday.
  const change =
    days > 1 && previousMetrics.total > 0
      ? Math.round(
          ((metrics.total - previousMetrics.total) / previousMetrics.total) *
            100,
        )
      : null;
  const activeOrders = orders.filter((order) =>
    ACTIVE_ORDER_STATUSES.includes(order.status),
  );
  const pending = activeOrders.filter((order) => order.status === "PENDING");
  const earlierPending = pending.filter(
    (order) => cafeDay(order.createdAt) < today,
  ).length;
  const ready = activeOrders.filter((order) => order.status === "READY").length;
  const preparing = activeOrders.filter((order) =>
    ["CONFIRMED", "PREPARING"].includes(order.status),
  ).length;
  const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
  const visibleOrders = (filter === "active" ? activeOrders : orders).filter(
    (order) =>
      !normalizedSearch ||
      [
        orderTicket(order),
        orderCustomerLabel(order),
        ...order.items.map((item) => item.product?.name || ""),
      ].some((value) =>
        value.toLocaleLowerCase("ru-RU").includes(normalizedSearch),
      ),
  );
  const week = dashboardPeriod(7, clock).map((day) => ({
    day,
    count: orders.filter((order) => cafeDay(order.createdAt) === day).length,
  }));
  const weekMax = Math.max(1, ...week.map((day) => day.count));
  const products = productsQuery.data?.products ?? [];
  const available = products.filter((product) => product.isAvailable).length;
  const refreshing =
    ordersQuery.isFetching || usersQuery.isFetching || productsQuery.isFetching;
  const refresh = () => {
    void ordersQuery.refetch();
    void usersQuery.refetch();
    void productsQuery.refetch();
  };
  const metricValue = (value: string | number) =>
    ordersQuery.isPending ? (
      <span className="dashboard-skeleton dashboard-value-skeleton" />
    ) : ordersQuery.isError && !ordersQuery.data ? (
      "—"
    ) : (
      value
    );

  return (
    <div className="admin-dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="dashboard-eyebrow">КАФЕ ПОД КОНТРОЛЕМ</p>
          <h1>Обзор</h1>
          <p className="dashboard-date">
            {dateLabel(clock.toISOString(), {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            · Калининград
          </p>
        </div>
        <button
          type="button"
          className="admin-icon-button dashboard-refresh"
          aria-label="Обновить данные"
          disabled={refreshing}
          onClick={refresh}
        >
          <RefreshCw
            size={19}
            className={refreshing ? "dashboard-spinning" : ""}
          />
        </button>
      </div>
      <div className="dashboard-period-row">
        <div
          className="dashboard-segmented"
          role="group"
          aria-label="Период статистики"
        >
          {periods.map((period) => (
            <button
              type="button"
              key={period.days}
              aria-pressed={days === period.days}
              onClick={() => setDays(period.days)}
            >
              {period.label}
            </button>
          ))}
        </div>
        <span className="dashboard-sync">
          {ordersQuery.isError
            ? "Нет связи"
            : ordersQuery.isPending
              ? "Загружаем"
              : "Каждые 10 сек."}
          <span className={ordersQuery.isError ? "is-offline" : ""} />
        </span>
      </div>

      {ordersQuery.isError && (
        <div className="dashboard-error" role="alert">
          <div>
            <strong>Не удалось обновить заказы</strong>
            <p>
              {ordersQuery.data
                ? "Показаны последние загруженные данные."
                : "Проверьте соединение и попробуйте ещё раз."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void ordersQuery.refetch()}
            disabled={ordersQuery.isFetching}
          >
            Повторить
          </button>
        </div>
      )}

      <section
        className="dashboard-metrics"
        aria-label="Показатели за выбранный период"
        aria-busy={ordersQuery.isPending}
      >
        <div className="dashboard-revenue">
          <div className="dashboard-metric-label">
            <span>Сумма заказов</span>
            <Banknote size={20} aria-hidden="true" />
          </div>
          <strong className="dashboard-revenue-value">
            {metricValue(money(metrics.total))}
          </strong>
          <div className="dashboard-revenue-footer">
            <span>
              {ordersQuery.data ? (
                <>Оплачено {money(metrics.paid)}</>
              ) : (
                "Без отменённых заказов"
              )}
            </span>
            {ordersQuery.data && change !== null && (
              <span
                className={`dashboard-trend ${change < 0 ? "is-negative" : ""}`}
              >
                {change < 0 ? (
                  <ArrowDownLeft size={14} aria-hidden="true" />
                ) : (
                  <ArrowUpRight size={14} aria-hidden="true" />
                )}
                {Math.abs(change)}%
                <span className="sr-only">
                  {change < 0 ? "снижение" : "рост"} к предыдущему периоду
                </span>
              </span>
            )}
          </div>
          <p className="dashboard-metric-note">
            {days === 1 ? "За сегодня" : `За последние ${days} дней`} · без
            отмен
          </p>
        </div>
        <div className="dashboard-metric-card">
          <span className="dashboard-metric-icon">
            <Receipt size={19} aria-hidden="true" />
          </span>
          <span className="dashboard-metric-label">Заказы</span>
          <strong>{metricValue(metrics.count)}</strong>
          <span className="dashboard-metric-note">За выбранный период</span>
        </div>
        <div className="dashboard-metric-card">
          <span className="dashboard-metric-icon">
            <ShoppingBag size={19} aria-hidden="true" />
          </span>
          <span className="dashboard-metric-label">Средний заказ</span>
          <strong>{metricValue(money(metrics.average))}</strong>
          <span className="dashboard-metric-note">Без отменённых</span>
        </div>
      </section>

      {ordersQuery.data && (
        <section
          className={`dashboard-attention ${activeOrders.length === 0 ? "is-clear" : ""}`}
          aria-label="Текущая очередь заказов"
        >
          <div className="dashboard-attention-heading">
            <span className="dashboard-attention-icon">
              {activeOrders.length ? (
                <Clock3 size={21} aria-hidden="true" />
              ) : (
                <CheckCheck size={21} aria-hidden="true" />
              )}
            </span>
            <div>
              <h2>
                {activeOrders.length ? "Требуют внимания" : "Всё под контролем"}
              </h2>
              <p>
                {pending.length
                  ? `${pending.length} ждут подтверждения`
                  : activeOrders.length
                    ? "Заказы в работе"
                    : "Активных заказов пока нет"}
              </p>
            </div>
            <button
              type="button"
              className="admin-icon-button"
              aria-label="Показать активные заказы"
              onClick={() => {
                setFilter("active");
                setSearch("");
                document
                  .getElementById("dashboard-orders-title")
                  ?.focus({ preventScroll: true });
                document
                  .getElementById("dashboard-orders")
                  ?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                    block: "start",
                  });
              }}
            >
              <ArrowRight size={20} />
            </button>
          </div>
          {activeOrders.length > 0 && (
            <div className="dashboard-queue">
              <span>
                <i className="queue-pending" />
                Ожидают <strong>{pending.length}</strong>
              </span>
              <span>
                <i className="queue-preparing" />В работе{" "}
                <strong>{preparing}</strong>
              </span>
              <span>
                <i className="queue-ready" />
                Готовы <strong>{ready}</strong>
              </span>
            </div>
          )}
          {earlierPending > 0 && (
            <p className="dashboard-older-note">
              Из них {earlierPending} ожидают с прошлых дней. Проверьте
              актуальность.
            </p>
          )}
        </section>
      )}

      <section
        className="dashboard-quick-actions"
        aria-label="Быстрые действия"
      >
        {quickActions.map(({ icon: Icon, ...action }) => (
          <Link key={action.href} href={action.href}>
            <span className="dashboard-action-icon">
              <Icon size={21} aria-hidden="true" />
            </span>
            <span>
              <strong>{action.label}</strong>
              <small>{action.description}</small>
            </span>
            <ChevronRight
              size={17}
              className="dashboard-action-chevron"
              aria-hidden="true"
            />
          </Link>
        ))}
      </section>

      <div className="dashboard-content-grid">
        <section
          id="dashboard-orders"
          className="dashboard-panel dashboard-orders-panel"
          aria-labelledby="dashboard-orders-title"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2 id="dashboard-orders-title" tabIndex={-1}>
                Заказы
              </h2>
              <p>Текущая очередь и последние поступления</p>
            </div>
            <Link href="/admin/orders" className="dashboard-text-link">
              Все <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="dashboard-order-tools">
            <div
              className="dashboard-order-tabs"
              role="group"
              aria-label="Фильтр заказов"
            >
              <button
                type="button"
                aria-pressed={filter === "active"}
                onClick={() => setFilter("active")}
              >
                В работе{" "}
                <span>{ordersQuery.data ? activeOrders.length : "—"}</span>
              </button>
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                Все заказы
              </button>
            </div>
            <div className="dashboard-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                aria-label="Поиск заказов"
                placeholder="Номер, клиент или блюдо"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => setSearch("")}
                >
                  <X size={17} />
                </button>
              )}
            </div>
          </div>
          <div
            className="dashboard-order-list"
            aria-busy={ordersQuery.isPending}
          >
            {ordersQuery.isPending ? (
              <div role="status" aria-label="Загружаем заказы">
                {[1, 2, 3].map((key) => (
                  <div
                    key={key}
                    className="dashboard-order-skeleton dashboard-skeleton"
                  />
                ))}
              </div>
            ) : ordersQuery.isError && !ordersQuery.data ? (
              <div className="dashboard-empty">
                <Receipt size={28} aria-hidden="true" />
                <h3>Заказы недоступны</h3>
                <p>Нажмите «Повторить» выше, чтобы загрузить список.</p>
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="dashboard-empty">
                <CheckCheck size={30} aria-hidden="true" />
                <h3>
                  {search
                    ? "Ничего не найдено"
                    : filter === "active"
                      ? "Очередь свободна"
                      : "Здесь появятся заказы"}
                </h3>
                <p>
                  {search
                    ? "Попробуйте другой номер, имя или название блюда."
                    : filter === "active"
                      ? "Новые заказы появятся автоматически."
                      : "Когда поступит первый заказ, вы увидите его здесь."}
                </p>
                {(search || filter === "active") && (
                  <button
                    type="button"
                    className="dashboard-text-link"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    Показать все заказы{" "}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              visibleOrders.slice(0, 5).map((order) => {
                const status = ORDER_STATUS_LABELS[order.status];
                return (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="dashboard-order-card"
                  >
                    <div className="dashboard-order-top">
                      <span className="dashboard-ticket">
                        {orderTicket(order)}
                      </span>
                      <span
                        className={`dashboard-status status-${order.status.toLowerCase()}`}
                      >
                        {status?.label || order.status}
                      </span>
                      <strong>{money(Number(order.total))}</strong>
                      <ChevronRight size={17} aria-hidden="true" />
                    </div>
                    <div className="dashboard-order-customer">
                      <span>{orderCustomerLabel(order)}</span>
                      <time dateTime={order.createdAt}>
                        {dateLabel(order.createdAt, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <OrderItemsList items={order.items || []} />
                    {(order.fulfillment || order.comment) && (
                      <div className="dashboard-order-footnote">
                        {fulfillmentLabel(order.fulfillment)}
                        {order.comment && <span> · {order.comment}</span>}
                      </div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
          {visibleOrders.length > 5 && (
            <Link href="/admin/orders" className="dashboard-orders-more">
              Все заказы в разделе «Заказы»{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </section>

        <div className="dashboard-secondary">
          <section
            className="dashboard-panel dashboard-week"
            aria-labelledby="dashboard-week-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <h2 id="dashboard-week-title">Ритм недели</h2>
                <p>Заказы за последние 7 дней</p>
              </div>
              <span className="dashboard-chart-icon">
                <Receipt size={19} aria-hidden="true" />
              </span>
            </div>
            {ordersQuery.isPending ? (
              <div className="dashboard-skeleton dashboard-chart-skeleton" />
            ) : ordersQuery.isError && !ordersQuery.data ? (
              <p className="dashboard-inline-error">
                Данные о заказах недоступны.
              </p>
            ) : (
              <>
                <p className="dashboard-week-total">
                  <strong>
                    {week.reduce((sum, day) => sum + day.count, 0)}
                  </strong>{" "}
                  заказов
                </p>
                <div
                  className="dashboard-bar-chart"
                  role="img"
                  aria-label={week
                    .map(
                      ({ day, count }) =>
                        `${dateLabel(`${day}T12:00:00Z`, { day: "numeric", month: "long" })}: ${count} заказов`,
                    )
                    .join("; ")}
                >
                  {week.map(({ day, count }) => (
                    <div
                      key={day}
                      className={`dashboard-chart-column ${day === today ? "is-today" : ""}`}
                      aria-hidden="true"
                    >
                      <span className="dashboard-bar-value">{count}</span>
                      <div className="dashboard-bar-track">
                        <div
                          className="dashboard-bar"
                          style={{
                            height: `${count ? Math.max(5, (count / weekMax) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="dashboard-bar-label">
                        {day === today
                          ? "Сегодня"
                          : dateLabel(`${day}T12:00:00Z`, { weekday: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
          <section
            className="dashboard-panel dashboard-resources"
            aria-labelledby="dashboard-resources-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <h2 id="dashboard-resources-title">Ваше кафе</h2>
                <p>Меню и гости</p>
              </div>
            </div>
            <Link href="/admin/products" className="dashboard-resource-row">
              <span className="dashboard-resource-icon">
                <UtensilsCrossed size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>Меню</strong>
                <small>
                  {productsQuery.isPending
                    ? "Загружаем…"
                    : productsQuery.isError
                      ? "Не удалось загрузить"
                      : `${available} доступны · ${products.length - available} скрыты`}
                </small>
              </span>
              <b>
                {productsQuery.isPending || productsQuery.isError
                  ? "—"
                  : products.length}
              </b>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/admin/users" className="dashboard-resource-row">
              <span className="dashboard-resource-icon">
                <Users size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>Гости</strong>
                <small>Зарегистрированные пользователи</small>
              </span>
              <b>
                {usersQuery.isPending || usersQuery.isError
                  ? "—"
                  : usersQuery.data?.users.length}
              </b>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
            {(productsQuery.isError || usersQuery.isError) && (
              <button
                type="button"
                className="dashboard-text-link dashboard-resource-retry"
                onClick={refresh}
                disabled={refreshing}
              >
                Повторить загрузку
              </button>
            )}
          </section>
          <p className="dashboard-footer-note">
            Показатели учитывают время Калининграда.
            <br />
            Сумма заказов и оплаченная сумма показаны отдельно.
          </p>
        </div>
      </div>
    </div>
  );
}
