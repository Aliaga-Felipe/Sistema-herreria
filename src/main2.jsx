import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import './features.css';

// =========================
// DATOS Y UTILIDADES
// =========================

const tabs = [
    ['Panel de control', '▦'],
    ['Productos', '▱'],
    ['Nuevo producto', '⊞'],
    ['Producción', '⌁'],
    ['Tareas finalizadas', '✓'],
    ['Producción mensual', '◫'],
    ['Recompensas', '♛'],
    ['Operarios', '♙']
];

const id = () =>
    Date.now().toString(36) +
    Math.random().toString(36).slice(2);

const initials = (name) =>
    name
        .split(' ')
        .map((x) => x[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

const save = (key, value) =>
    localStorage.setItem(key, JSON.stringify(value));

function stored(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
        return [];
    }
}

// =========================
// COMPONENTES GENERALES
// =========================

const Stat = ({ n, v }) => (
    <article className="stat-card">
        <span>{n}</span>
        <strong>{v}</strong>
    </article>
);

const Progress = ({ v }) => (
    <div className="progress">
        <i style={{ width: `${v}%` }} />
    </div>
);

const Empty = ({ title, text, button }) => (
    <section className="empty">
        <span>◇</span>
        <h3>{title}</h3>
        <p>{text}</p>
        {button}
    </section>
);

function Header({ kicker, title, text, children }) {
    return (
        <section className="headline">
            <div>
                <p className="eyebrow">{kicker}</p>
                <h1>{title}</h1>
                <p className="muted">{text}</p>
            </div>

            {children}
        </section>
    );
}

function Modal({ title, close, children }) {
    return (
        <div className="modal-back">
            <section className="modal">
                <button
                    className="close"
                    onClick={close}
                >
                    ×
                </button>

                <p className="eyebrow">El Atelier</p>
                <h2>{title}</h2>

                {children}
            </section>
        </div>
    );
}

function Actions({ close, label }) {
    return (
        <div className="form-actions">
            <button
                type="button"
                className="secondary"
                onClick={close}
            >
                Cancelar
            </button>

            <button className="primary">
                {label}
            </button>
        </div>
    );
}

// =========================
// APP PRINCIPAL
// =========================

function App() {
    const [tab, setTab] = useState('Panel de control');

    const [products, setProducts] = useState(() =>
        stored('atelier_products')
    );

    const [orders, setOrders] = useState(() =>
        stored('atelier_orders')
    );

    const [people, setPeople] = useState(() =>
        stored('atelier_people')
    );

    const [teams, setTeams] = useState(() =>
        stored('atelier_teams')
    );

    const [rewards, setRewards] = useState(() =>
        stored('atelier_rewards')
    );

    const [modal, setModal] = useState('');
    const [toast, setToast] = useState('');
    const [query, setQuery] = useState('');

    // =========================
    // FUNCIONES
    // =========================

    const update = (key, setter, next) => {
        setter(next);
        save(key, next);
    };

    const say = (message) => {
        setToast(message);

        setTimeout(() => {
            setToast('');
        }, 2600);
    };

    const addProduct = (product) => {
        const next = [...products, product];

        update(
            'atelier_products',
            setProducts,
            next
        );

        setModal('');
        setTab('Productos');
        say('Producto creado con sus etapas.');
    };

    const addOrder = (order) => {
        const next = [...orders, order];

        update(
            'atelier_orders',
            setOrders,
            next
        );

        setModal('');
        setTab('Producción');
        say('Orden creada y enviada a producción.');
    };

    const advance = (orderId) => {
        const next = orders.map((order) => {
            if (order.id !== orderId) {
                return order;
            }

            const at = order.stages.findIndex(
                (stage) => !stage.done
            );

            const stages = order.stages.map((stage, index) =>
                index === at
                    ? { ...stage, done: true }
                    : stage
            );

            const done = stages.every(
                (stage) => stage.done
            );

            return {
                ...order,
                stages,
                done
            };
        });

        update(
            'atelier_orders',
            setOrders,
            next
        );

        const updatedOrder = next.find(
            (order) => order.id === orderId
        );

        say(
            updatedOrder.done
                ? 'Orden terminada.'
                : 'Etapa completada.'
        );
    };

    const filtered = orders.filter((order) => {
        const search = query.toLowerCase();

        return (
            !query ||
            order.code
                .toLowerCase()
                .includes(search) ||
            (
                products.find(
                    (product) =>
                        product.id === order.productId
                )?.name || ''
            )
                .toLowerCase()
                .includes(search)
        );
    });

    const removeProduct = (productId) => {
        update(
            'atelier_products',
            setProducts,
            products.filter(
                (product) => product.id !== productId
            )
        );

        say('Producto eliminado.');
    };

    // =========================
    // CONTENIDO DE LA PÁGINA
    // =========================

    let page;

    // Panel de control
    if (tab === 'Panel de control') {
        const active = orders.filter(
            (order) => !order.done
        );

        page = (
            <>
                <Header
                    kicker="Resumen de operaciones"
                    title="Panel de producción"
                    text="Controlá cada orden, equipo y etapa en un solo lugar."
                >
                    <button
                        className="primary"
                        onClick={() => setModal('order')}
                    >
                        + Nueva orden
                    </button>
                </Header>

                <section className="stats-grid dashboard-stats">
                    <Stat
                        n="Productos en curso"
                        v={active.length}
                    />

                    <Stat
                        n="Pendientes"
                        v={
                            active.filter(
                                (order) =>
                                    !order.stages.some(
                                        (stage) => stage.done
                                    )
                            ).length
                        }
                    />

                    <Stat
                        n="Terminados"
                        v={
                            orders.filter(
                                (order) => order.done
                            ).length
                        }
                    />

                    <Stat
                        n="Tareas en proceso"
                        v={active.length}
                    />

                    <Stat
                        n="Recompensas"
                        v={rewards.length}
                    />
                </section>

                <OrderList
                    list={active}
                    products={products}
                    people={people}
                    advance={advance}
                    open={() => setModal('order')}
                />
            </>
        );
    }

    // Productos
    else if (
        tab === 'Productos' ||
        tab === 'Nuevo producto'
    ) {
        page = (
            <>
                <Header
                    kicker="Catálogo de fabricación"
                    title="Productos"
                    text="Cada producto tiene su propio recorrido de producción."
                >
                    <button
                        className="primary"
                        onClick={() => setModal('product')}
                    >
                        + Nuevo producto
                    </button>
                </Header>

                {products.length ? (
                    <section className="product-grid">
                        {products.map((product) => (
                            <article
                                className="product-card"
                                key={product.id}
                            >
                                <div className="product-symbol">
                                    ▱
                                </div>

                                <div className="product-info">
                                    <h3>{product.name}</h3>

                                    <p>
                                        {product.description ||
                                            'Sin descripción.'}
                                    </p>

                                    <div className="tags">
                                        {product.stages.map(
                                            (stage, index) => (
                                                <span key={stage}>
                                                    {index + 1}. {stage}
                                                </span>
                                            )
                                        )}
                                    </div>
                                </div>

                                <button
                                    className="remove"
                                    onClick={() =>
                                        removeProduct(product.id)
                                    }
                                >
                                    ×
                                </button>
                            </article>
                        ))}
                    </section>
                ) : (
                    <Empty
                        title="No hay productos cargados"
                        text="Creá el primer producto y sus etapas de fabricación."
                        button={
                            <button
                                className="primary"
                                onClick={() =>
                                    setModal('product')
                                }
                            >
                                Crear producto
                            </button>
                        }
                    />
                )}
            </>
        );
    }

    // Producción
    else if (tab === 'Producción') {
        page = (
            <>
                <Header>
                    <button
                        className="primary"
                        onClick={() => setModal('order')}
                    >
                        + Nueva orden
                    </button>
                </Header>

                <OrderList
                    list={filtered.filter(
                        (order) => !order.done
                    )}
                    products={products}
                    people={people}
                    advance={advance}
                    open={() => setModal('order')}
                />
            </>
        );
    }

    // Tareas finalizadas
    else if (tab === 'Tareas finalizadas') {
        page = (
            <>
                <Header
                    kicker="Historial de fabricación"
                    title="Tareas finalizadas"
                    text="Órdenes concluidas por el taller."
                />

                <OrderList
                    list={filtered.filter(
                        (order) => order.done
                    )}
                    products={products}
                    people={people}
                    advance={() => {}}
                />
            </>
        );
    }

    // Producción mensual
    else if (tab === 'Producción mensual') {
        const stages = orders.flatMap(
            (order) => order.stages
        );

        const complete = stages.filter(
            (stage) => stage.done
        ).length;

        const max = Math.max(
            stages.length,
            1
        );

        page = (
            <>
                <Header
                    kicker="Métricas analíticas"
                    title="Producción mensual"
                    text="Los indicadores se calculan solamente con los datos que cargues."
                />

                {orders.length ? (
                    <>
                        <section className="stats-grid monthly-stats">
                            <Stat
                                n="Órdenes iniciadas"
                                v={orders.length}
                            />

                            <Stat
                                n="Terminadas"
                                v={
                                    orders.filter(
                                        (order) => order.done
                                    ).length
                                }
                            />

                            <Stat
                                n="En producción"
                                v={
                                    orders.filter(
                                        (order) => !order.done
                                    ).length
                                }
                            />

                            <Stat
                                n="Etapas pendientes"
                                v={
                                    stages.length - complete
                                }
                            />
                        </section>

                        <section className="analytics">
                            <article className="chart-card">
                                <div className="card-title">
                                    Avance de etapas
                                </div>

                                <div className="chart">
                                    <div className="bar-wrap">
                                        <i
                                            className="active-bar"
                                            style={{
                                                height: `${Math.max(
                                                    8,
                                                    (complete / max) * 100
                                                )}%`
                                            }}
                                        />

                                        <small>
                                            Completadas
                                        </small>
                                    </div>

                                    <div className="bar-wrap">
                                        <i
                                            style={{
                                                height: `${Math.max(
                                                    8,
                                                    ((max - complete) / max) *
                                                        100
                                                )}%`
                                            }}
                                        />

                                        <small>
                                            Pendientes
                                        </small>
                                    </div>
                                </div>
                            </article>

                            {people.length ? (
                                <article className="operator-summary">
                                    <div className="card-title">
                                        Operarios
                                    </div>

                                    {people.map((person) => (
                                        <div
                                            className="person"
                                            key={person.id}
                                        >
                                            <span>
                                                {initials(person.name)}
                                            </span>

                                            <b>{person.name}</b>

                                            <Progress v={0} />

                                            <strong>0</strong>
                                        </div>
                                    ))}
                                </article>
                            ) : (
                                <article className="operator-summary subdued">
                                    <div className="card-title">
                                        Operarios
                                    </div>

                                    <p>
                                        Este panel aparecerá cuando
                                        exista personal cargado.
                                    </p>
                                </article>
                            )}
                        </section>
                    </>
                ) : (
                    <Empty
                        title="Aún no hay datos de producción"
                        text="Cuando registres órdenes y avances etapas, se generarán las estadísticas."
                        button={
                            <button
                                className="primary"
                                onClick={() =>
                                    setModal('order')
                                }
                            >
                                Crear primera orden
                            </button>
                        }
                    />
                )}
            </>
        );
    }

    // Recompensas
    else if (tab === 'Recompensas') {
        const eligible = orders.filter(
            (order) =>
                order.done &&
                !rewards.some(
                    (reward) =>
                        reward.orderId === order.id
                )
        );

        page = (
            <>
                <Header
                    kicker="Reconocimiento al equipo"
                    title="Recompensas"
                    text="Otorgá puntos una vez que un pedido haya sido terminado."
                >
                    {eligible.length && teams.length ? (
                        <button
                            className="primary"
                            onClick={() =>
                                setModal('reward')
                            }
                        >
                            + Otorgar recompensa
                        </button>
                    ) : null}
                </Header>

                {rewards.length ? (
                    <section className="simple-list">
                        {rewards.map((reward) => {
                            const order = orders.find(
                                (item) =>
                                    item.id === reward.orderId
                            );

                            const product = products.find(
                                (item) =>
                                    item.id ===
                                    order?.productId
                            );

                            const team = teams.find(
                                (item) =>
                                    item.id === reward.teamId
                            );

                            return (
                                <article key={reward.id}>
                                    <span className="medal">
                                        ♛
                                    </span>

                                    <div>
                                        <b>{product?.name}</b>

                                        <p>
                                            {team?.name} ·{' '}
                                            {reward.points}{' '}
                                            puntos
                                        </p>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                ) : (
                    <Empty
                        title="No hay recompensas otorgadas"
                        text={
                            teams.length
                                ? 'Completá una orden para otorgar una recompensa.'
                                : 'Primero agregá operarios y formá un equipo de trabajo.'
                        }
                    />
                )}
            </>
        );
    }

    // Operarios
    else if (tab === 'Operarios') {
        page = (
            <>
                <Header
                    kicker="Personas y equipos"
                    title="Operarios"
                    text="Administrá accesos, responsables y equipos de trabajo."
                >
                    <div className="actions">
                        <button
                            className="filter"
                            onClick={() =>
                                setModal('team')
                            }
                        >
                            + Nuevo equipo
                        </button>

                        <button
                            className="primary"
                            onClick={() =>
                                setModal('person')
                            }
                        >
                            + Agregar operario
                        </button>
                    </div>
                </Header>

                {people.length ? (
                    <section className="employee-grid">
                        {people.map((person) => (
                            <article
                                className="employee-card"
                                key={person.id}
                            >
                                <span className="avatar">
                                    {initials(person.name)}
                                </span>

                                <div>
                                    <h3>{person.name}</h3>
                                    <p>{person.email}</p>
                                    <small>Operario</small>
                                </div>

                                <div className="card-buttons">
                                    <button
                                        onClick={() =>
                                            say(
                                                `Restablecimiento preparado para ${person.name}.`
                                            )
                                        }
                                    >
                                        Restablecer clave
                                    </button>

                                    <button
                                        className="danger-link"
                                        onClick={() => {
                                            const next =
                                                people.filter(
                                                    (item) =>
                                                        item.id !==
                                                        person.id
                                                );

                                            update(
                                                'atelier_people',
                                                setPeople,
                                                next
                                            );

                                            say(
                                                'Operario eliminado.'
                                            );
                                        }}
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            </article>
                        ))}
                    </section>
                ) : (
                    <Empty
                        title="No hay operarios cargados"
                        text="Agregá personal cuando exista para asignarlo a las etapas de producción."
                        button={
                            <button
                                className="primary"
                                onClick={() =>
                                    setModal('person')
                                }
                            >
                                Agregar operario
                            </button>
                        }
                    />
                )}

                <section className="section-heading teams-heading">
                    <div>
                        <h2>Equipos de trabajo</h2>
                        <p>
                            Los equipos permiten asignar
                            recompensas por pedido.
                        </p>
                    </div>
                </section>

                {teams.length ? (
                    <section className="team-grid">
                        {teams.map((team) => (
                            <article
                                className="team-card"
                                key={team.id}
                            >
                                <b>{team.name}</b>

                                <p>
                                    {team.members.length}{' '}
                                    integrante
                                    {team.members.length !== 1
                                        ? 's'
                                        : ''}
                                </p>

                                <div>
                                    {team.members.map(
                                        (member) => (
                                            <span key={member}>
                                                {initials(
                                                    people.find(
                                                        (person) =>
                                                            person.id ===
                                                            member
                                                    )?.name || '?'
                                                )}
                                            </span>
                                        )
                                    )}
                                </div>
                            </article>
                        ))}
                    </section>
                ) : (
                    <p className="notice">
                        Todavía no hay equipos creados.
                    </p>
                )}
            </>
        );
    }

    // Configuración
    else {
        page = (
            <>
                <Header
                    kicker="Administración"
                    title="Configuración"
                    text="Ajustes de seguridad y preferencias del sistema."
                />

                <section className="settings-grid">
                    <article>
                        <span>🔐</span>

                        <h3>
                            Seguridad de la cuenta
                        </h3>

                        <p>
                            Actualizá la contraseña del
                            administrador o gestioná su
                            recuperación.
                        </p>

                        <button
                            className="filter"
                            onClick={() =>
                                setModal('password')
                            }
                        >
                            Gestionar contraseña
                        </button>
                    </article>

                    <article>
                        <span>▣</span>

                        <h3>
                            Datos del taller
                        </h3>

                        <p>
                            La estructura está preparada para
                            sincronizarse con PostgreSQL.
                        </p>
                    </article>
                </section>
            </>
        );
    }

    // =========================
    // RENDER
    // =========================

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    El Atelier
                    <span>HUB DE PRODUCCIÓN</span>
                </div>

                <nav>
                    {tabs.map(([name, icon]) => (
                        <button
                            key={name}
                            className={
                                tab === name
                                    ? 'selected'
                                    : ''
                            }
                            onClick={() => {
                                setTab(name);

                                if (
                                    name ===
                                    'Nuevo producto'
                                ) {
                                    setModal('product');
                                }
                            }}
                        >
                            <Icon>{icon}</Icon>
                            {name}
                        </button>
                    ))}
                </nav>

                <div className="side-bottom">
                    <button
                        className={
                            tab === 'Configuración'
                                ? 'selected'
                                : ''
                        }
                        onClick={() =>
                            setTab('Configuración')
                        }
                    >
                        <Icon>⚙</Icon>
                        Configuración
                    </button>

                    <div className="user">
                        <span>MA</span>

                        <div>
                            <b>Administrador</b>
                            <small>
                                Cuenta administradora
                            </small>
                        </div>
                    </div>
                </div>
            </aside>

            <main>
                <header>
                    <div className="crumb">
                        {tab}
                    </div>

                    <div className="top-actions">
                        <label className="search">
                            ⌕

                            <input
                                value={query}
                                onChange={(e) =>
                                    setQuery(e.target.value)
                                }
                                placeholder="Buscar producto u orden..."
                            />
                        </label>

                        <button className="profile">
                            MA
                        </button>
                    </div>
                </header>

                <div className="content">
                    {page}
                </div>
            </main>

            {modal === 'product' && (
                <ProductModal
                    close={() => setModal('')}
                    save={addProduct}
                />
            )}

            {modal === 'order' && (
                <OrderModal
                    products={products}
                    people={people}
                    close={() => setModal('')}
                    save={addOrder}
                />
            )}

            {modal === 'person' && (
                <PersonModal
                    close={() => setModal('')}
                    save={(person) => {
                        update(
                            'atelier_people',
                            setPeople,
                            [...people, person]
                        );

                        setModal('');
                        say(
                            'Operario agregado correctamente.'
                        );
                    }}
                />
            )}

            {modal === 'team' && (
                <TeamModal
                    people={people}
                    close={() => setModal('')}
                    save={(team) => {
                        update(
                            'atelier_teams',
                            setTeams,
                            [...teams, team]
                        );

                        setModal('');
                        say(
                            'Equipo creado correctamente.'
                        );
                    }}
                />
            )}

            {modal === 'reward' && (
                <RewardModal
                    orders={orders.filter(
                        (order) =>
                            order.done &&
                            !rewards.some(
                                (reward) =>
                                    reward.orderId ===
                                    order.id
                            )
                    )}
                    teams={teams}
                    close={() => setModal('')}
                    save={(reward) => {
                        update(
                            'atelier_rewards',
                            setRewards,
                            [...rewards, reward]
                        );

                        setModal('');
                        say('Recompensa otorgada.');
                    }}
                />
            )}

            {modal === 'password' && (
                <PasswordModal
                    close={() => setModal('')}
                    done={() =>
                        say(
                            'La contraseña fue actualizada.'
                        )
                    }
                />
            )}

            {toast && (
                <div className="toast">
                    ✓ {toast}
                </div>
            )}
        </div>
    );
}

// =========================
// COMPONENTES
// =========================

function Icon({ children }) {
    return (
        <span className="icon">
            {children}
        </span>
    );
}

function OrderList({
    list,
    products,
    people,
    advance,
    open
}) {
    if (!list.length) {
        return (
            <Empty
                title="No hay órdenes para mostrar"
                text="Creá una orden para iniciar el seguimiento de producción."
                button={
                    open && (
                        <button
                            className="primary"
                            onClick={open}
                        >
                            Crear orden
                        </button>
                    )
                }
            />
        );
    }

    return (
        <section className="orders-card">
            <div className="order-head">
                <span>Producto</span>
                <span>Cliente</span>
                <span>Etapa actual</span>
                <span>Progreso</span>
                <span>Responsable</span>
                <span>Acción</span>
            </div>

            {list.map((order) => {
                const product = products.find(
                    (item) =>
                        item.id === order.productId
                );

                const currentStage =
                    order.stages.find(
                        (stage) => !stage.done
                    );

                const percent = Math.round(
                    (
                        order.stages.filter(
                            (stage) => stage.done
                        ).length /
                        order.stages.length
                    ) * 100
                );

                const person = people.find(
                    (item) =>
                        item.id === order.personId
                );

                return (
                    <div
                        className="order-row"
                        key={order.id}
                    >
                        <div className="product">
                            <div className="product-thumb">
                                ▦
                            </div>

                            <div>
                                <b>{product?.name}</b>
                                <small>{order.code}</small>
                            </div>
                        </div>

                        <div className="client">
                            <b>
                                {order.client ||
                                    'Sin cliente'}
                            </b>

                            <small>
                                {order.quantity} unidad
                                {+order.quantity !== 1
                                    ? 'es'
                                    : ''}
                            </small>
                        </div>

                        <div>
                            <em className="stage">
                                •{' '}
                                {currentStage?.name ||
                                    'Finalizado'}
                            </em>
                        </div>

                        <div className="progress-cell">
                            <b>{percent}%</b>
                            <Progress v={percent} />
                        </div>

                        <div className="worker">
                            {person ? (
                                <>
                                    <span>
                                        {initials(
                                            person.name
                                        )}
                                    </span>

                                    {person.name}
                                </>
                            ) : (
                                <small>
                                    Sin asignar
                                </small>
                            )}
                        </div>

                        <div>
                            {currentStage ? (
                                <button
                                    className="row-action"
                                    onClick={() =>
                                        advance(order.id)
                                    }
                                >
                                    Completar
                                </button>
                            ) : (
                                <span className="done">
                                    ✓ Listo
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}

// =========================
// MODAL PRODUCTO
// =========================

function ProductModal({ close, save }) {
    const [name, setName] = useState('');
    const [description, setDescription] =
        useState('');

    const [stages, setStages] = useState([
        'Diseño y medidas',
        'Corte de material',
        'Soldadura'
    ]);

    return (
        <Modal
            title="Nuevo producto"
            close={close}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();

                    save({
                        id: id(),
                        name,
                        description,
                        stages: stages.filter(Boolean)
                    });
                }}
            >
                <label>
                    Nombre del producto

                    <input
                        required
                        value={name}
                        onChange={(e) =>
                            setName(e.target.value)
                        }
                        placeholder="Ej. Portón de hierro"
                    />
                </label>

                <label>
                    Descripción

                    <textarea
                        value={description}
                        onChange={(e) =>
                            setDescription(
                                e.target.value
                            )
                        }
                        placeholder="Características o notas"
                    />
                </label>

                <div className="stage-edit">
                    <div>
                        <b>Etapas de producción</b>
                        <span>
                            Definí el recorrido del producto.
                        </span>
                    </div>

                    {stages.map((stage, index) => (
                        <div
                            className="stage-input"
                            key={index}
                        >
                            <small>
                                {index + 1}
                            </small>

                            <input
                                required
                                value={stage}
                                onChange={(e) =>
                                    setStages(
                                        stages.map(
                                            (item, itemIndex) =>
                                                itemIndex ===
                                                index
                                                    ? e.target.value
                                                    : item
                                        )
                                    )
                                }
                            />

                            <button
                                type="button"
                                onClick={() =>
                                    setStages(
                                        stages.filter(
                                            (_, itemIndex) =>
                                                itemIndex !==
                                                index
                                        )
                                    )
                                }
                            >
                                ×
                            </button>
                        </div>
                    ))}

                    <button
                        type="button"
                        className="add-stage"
                        onClick={() =>
                            setStages([
                                ...stages,
                                ''
                            ])
                        }
                    >
                        + Agregar etapa
                    </button>
                </div>

                <Actions
                    close={close}
                    label="Guardar producto"
                />
            </form>
        </Modal>
    );
}

// =========================
// MODAL ORDEN
// =========================

function OrderModal({
    products,
    people,
    close,
    save
}) {
    const [productId, setProductId] =
        useState(products[0]?.id || '');

    const [client, setClient] =
        useState('');

    const [quantity, setQuantity] =
        useState(1);

    const [personId, setPersonId] =
        useState('');

    if (!products.length) {
        return (
            <Modal
                title="Nueva orden"
                close={close}
            >
                <Empty
                    title="Primero creá un producto"
                    text="Las órdenes se construyen a partir de sus etapas."
                    button={
                        <button
                            className="primary"
                            onClick={close}
                        >
                            Entendido
                        </button>
                    }
                />
            </Modal>
        );
    }

    return (
        <Modal
            title="Nueva orden"
            close={close}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();

                    const product =
                        products.find(
                            (item) =>
                                item.id ===
                                productId
                        );

                    save({
                        id: id(),
                        code: `OT-${String(
                            Date.now()
                        ).slice(-5)}`,
                        productId,
                        client,
                        quantity,
                        personId,
                        done: false,
                        stages:
                            product.stages.map(
                                (name) => ({
                                    name,
                                    done: false
                                })
                            )
                    });
                }}
            >
                <label>
                    Producto

                    <select
                        value={productId}
                        onChange={(e) =>
                            setProductId(
                                e.target.value
                            )
                        }
                    >
                        {products.map((product) => (
                            <option
                                key={product.id}
                                value={product.id}
                            >
                                {product.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    Cliente

                    <input
                        value={client}
                        onChange={(e) =>
                            setClient(
                                e.target.value
                            )
                        }
                        placeholder="Nombre del cliente (opcional)"
                    />
                </label>

                <label>
                    Cantidad

                    <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) =>
                            setQuantity(
                                e.target.value
                            )
                        }
                    />
                </label>

                {people.length > 0 && (
                    <label>
                        Responsable

                        <select
                            value={personId}
                            onChange={(e) =>
                                setPersonId(
                                    e.target.value
                                )
                            }
                        >
                            <option value="">
                                Sin asignar
                            </option>

                            {people.map((person) => (
                                <option
                                    key={person.id}
                                    value={person.id}
                                >
                                    {person.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

                <Actions
                    close={close}
                    label="Crear orden"
                />
            </form>
        </Modal>
    );
}

// =========================
// MODAL OPERARIO
// =========================

function PersonModal({ close, save }) {
    const [name, setName] =
        useState('');

    const [email, setEmail] =
        useState('');

    return (
        <Modal
            title="Agregar operario"
            close={close}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();

                    save({
                        id: id(),
                        name,
                        email
                    });
                }}
            >
                <label>
                    Nombre completo

                    <input
                        required
                        value={name}
                        onChange={(e) =>
                            setName(
                                e.target.value
                            )
                        }
                    />
                </label>

                <label>
                    Correo electrónico

                    <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) =>
                            setEmail(
                                e.target.value
                            )
                        }
                    />
                </label>

                <p className="form-note">
                    Se preparará una invitación para
                    crear la contraseña de acceso.
                </p>

                <Actions
                    close={close}
                    label="Agregar operario"
                />
            </form>
        </Modal>
    );
}

// =========================
// MODAL EQUIPO
// =========================

function TeamModal({
    people,
    close,
    save
}) {
    const [name, setName] =
        useState('');

    const [members, setMembers] =
        useState([]);

    return (
        <Modal
            title="Nuevo equipo"
            close={close}
        >
            {people.length ? (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();

                        save({
                            id: id(),
                            name,
                            members
                        });
                    }}
                >
                    <label>
                        Nombre del equipo

                        <input
                            required
                            value={name}
                            onChange={(e) =>
                                setName(
                                    e.target.value
                                )
                            }
                        />
                    </label>

                    <div className="checkboxes">
                        <b>Integrantes</b>

                        {people.map((person) => (
                            <label
                                key={person.id}
                            >
                                <input
                                    type="checkbox"
                                    checked={members.includes(
                                        person.id
                                    )}
                                    onChange={(e) =>
                                        setMembers(
                                            e.target.checked
                                                ? [
                                                      ...members,
                                                      person.id
                                                  ]
                                                : members.filter(
                                                      (id) =>
                                                          id !==
                                                          person.id
                                                  )
                                        )
                                    }
                                />

                                {person.name}
                            </label>
                        ))}
                    </div>

                    <Actions
                        close={close}
                        label="Crear equipo"
                    />
                </form>
            ) : (
                <Empty
                    title="No hay operarios disponibles"
                    text="Agregá al menos un operario antes de crear un equipo."
                />
            )}
        </Modal>
    );
}

// =========================
// MODAL RECOMPENSA
// =========================

function RewardModal({
    orders,
    teams,
    close,
    save
}) {
    const [orderId, setOrderId] =
        useState(orders[0]?.id || '');

    const [teamId, setTeamId] =
        useState(teams[0]?.id || '');

    const [points, setPoints] =
        useState(10);

    return (
        <Modal
            title="Otorgar recompensa"
            close={close}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();

                    save({
                        id: id(),
                        orderId,
                        teamId,
                        points
                    });
                }}
            >
                <label>
                    Orden

                    <select
                        value={orderId}
                        onChange={(e) =>
                            setOrderId(
                                e.target.value
                            )
                        }
                    >
                        {orders.map((order) => (
                            <option
                                key={order.id}
                                value={order.id}
                            >
                                {order.code}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    Equipo

                    <select
                        value={teamId}
                        onChange={(e) =>
                            setTeamId(
                                e.target.value
                            )
                        }
                    >
                        {teams.map((team) => (
                            <option
                                key={team.id}
                                value={team.id}
                            >
                                {team.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    Puntos

                    <input
                        min="1"
                        type="number"
                        value={points}
                        onChange={(e) =>
                            setPoints(
                                e.target.value
                            )
                        }
                    />
                </label>

                <Actions
                    close={close}
                    label="Otorgar recompensa"
                />
            </form>
        </Modal>
    );
}

// =========================
// MODAL CONTRASEÑA
// =========================

function PasswordModal({
    close,
    done
}) {
    const [next, setNext] =
        useState('');

    return (
        <Modal
            title="Seguridad de la cuenta"
            close={close}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();

                    done();
                    close();
                }}
            >
                <label>
                    Nueva contraseña

                    <input
                        required
                        minLength="12"
                        type="password"
                        value={next}
                        onChange={(e) =>
                            setNext(
                                e.target.value
                            )
                        }
                    />
                </label>

                <p className="form-note">
                    Usá al menos 12 caracteres, con
                    letras, números y símbolos.
                </p>

                <Actions
                    close={close}
                    label="Actualizar contraseña"
                />
            </form>
        </Modal>
    );
}

// =========================
// RENDER
// =========================

createRoot(
    document.getElementById('root')
).render(
    <App />
);
