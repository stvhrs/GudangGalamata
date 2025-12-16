import React from 'react';
import { Layout, Menu, Button, Typography } from 'antd';
import { Link } from 'react-router-dom';
import {
    ReadOutlined,
    TeamOutlined,
    ShoppingCartOutlined,
    DollarCircleOutlined,
    RollbackOutlined,
    FileTextOutlined,
    LogoutOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;
const { Text } = Typography;

// ============================
// Navigation Menu Component
// ============================
export const NavigationMenu = ({ activeKey, onLinkClick }) => (
    <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[activeKey]}
        onClick={onLinkClick}
        items={[
            // 1. DATA MASTER
            {
                key: '/buku',
                icon: <ReadOutlined />, 
                label: <Link to="/buku">Data Buku</Link>
            },
            {
                key: '/pelanggan',
                icon: <TeamOutlined />, 
                label: <Link to="/pelanggan">Data Pelanggan</Link>
            },

            // 2. TRANSAKSI UTAMA
            {
                key: '/transaksi-jual',
                icon: <ShoppingCartOutlined />, 
                label: <Link to="/transaksi-jual">Transaksi Jual</Link>
            },

            // 3. KEUANGAN & PENYELESAIAN
            {
                key: '/pembayaran',
                icon: <DollarCircleOutlined />, 
                label: <Link to="/pembayaran">Pembayaran</Link>
            },
            {
                key: '/retur',
                icon: <RollbackOutlined />, 
                label: <Link to="/retur">Retur</Link>
            }, 
            {
                key: '/nonFaktur',
                icon: <FileTextOutlined />, 
                label: <Link to="/nonFaktur">Non Faktur</Link>
            },
        ]}
    />
);

// ============================
// Side Menu Component
// ============================
const SideMenu = ({ collapsed, onCollapse, activeKey, onLogout, userEmail }) => {
    return (
        <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={onCollapse}
            width={240}
            style={{
                overflow: 'hidden', // Ubah ke hidden biar rapi
                height: '100vh',
                position: 'fixed',
                left: 0,
                top: 0,
                bottom: 0,
                zIndex: 10,
            }}
        >
            {/* 1. Header Logo */}
            <div
                style={{
                    height: '48px',
                    margin: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                }}
            >
                {!collapsed ? (
                    <Text
                        style={{
                            color: 'white',
                            fontSize: '18px',
                            fontWeight: 600,
                        }}
                    >
                        CV Galatama
                    </Text>
                ) : (
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>CVG</Text>
                )}
            </div>

            {/* 2. Scrollable Menu Area */}
            {/* Kita bungkus Menu dalam div tersendiri biar bisa di-scroll terpisah dari footer */}
            <div style={{ 
                height: 'calc(100vh - 64px - 130px)', // Kurangi tinggi header & footer & trigger
                overflowY: 'auto',
                scrollbarWidth: 'none', // Hide scrollbar Firefox
                msOverflowStyle: 'none',  // Hide scrollbar IE/Edge
            }}>
                <NavigationMenu activeKey={activeKey} onLinkClick={() => {}} />
            </div>

            {/* 3. Footer (User Info & Logout) */}
            <div
                style={{
                    position: 'absolute',
                    // vvv PERUBAHAN UTAMA DI SINI vvv
                    bottom: 48, // Naikkan 48px supaya tidak ketutup tombol collapse (<)
                    // ^^^ PERUBAHAN UTAMA DI SINI ^^^
                    
                    width: '100%',
                    padding: collapsed ? '10px 4px' : '16px',
                    borderTop: '1px solid #1f1f1f',
                    background: '#001529',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: 11, // Pastikan di atas layer lain jika perlu
                }}
            >
                {/* Email User */}
                {!collapsed && userEmail && (
                    <Text
                        style={{
                            color: 'rgba(255, 255, 255, 0.65)',
                            marginBottom: '12px',
                            width: '100%',
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '13px'
                        }}
                        title={userEmail}
                    >
                        {userEmail}
                    </Text>
                )}

                {/* Tombol Logout (Outline Subtle) */}
                <Button
                    type="default"
                    ghost 
                    icon={<LogoutOutlined />}
                    onClick={onLogout}
                    style={{
                        width: '100%',
                        color: 'rgba(255, 255, 255, 0.65)', 
                        borderColor: 'rgba(255, 255, 255, 0.3)', 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    title="Keluar"
                >
                    {!collapsed && 'Keluar'}
                </Button>
            </div>
        </Sider>
    );
};

export default SideMenu;