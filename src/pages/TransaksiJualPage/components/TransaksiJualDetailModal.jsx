import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Table, Typography, Tag, Timeline, Empty, Button, Divider, Spin, Row, Col, Statistic } from 'antd';
import { db } from '../../../api/firebase'; 
import { ref, query, orderByChild, equalTo, onValue } from "firebase/database";
import { 
    CheckCircleOutlined, 
    SyncOutlined, 
    ExclamationCircleOutlined,
    ArrowLeftOutlined,
    ArrowRightOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

// --- Helper Format ---
const formatCurrency = (value) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value || 0);

const formatDate = (timestamp) =>
    new Date(timestamp || 0).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

const formatTimestamp = (timestamp) => {
    if (!timestamp) return '...';
    return new Date(timestamp).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

// --- Kolom Tabel Item ---
const itemColumns = [
    { 
        title: 'Nama Buku', 
        dataIndex: 'judul', 
        key: 'judul',
        render: (text) => <Text strong>{text || '-'}</Text>
    }, 
    { 
        title: 'Qty', 
        dataIndex: 'qty', 
        key: 'qty', 
        align: 'center', 
        width: 80 
    },
    { 
        title: 'Harga', 
        dataIndex: 'harga', 
        key: 'harga', 
        align: 'right', 
        render: (val) => formatCurrency(val) 
    },
    { 
        title: 'Disc', 
        dataIndex: 'diskonPersen', 
        key: 'diskonPersen', 
        align: 'center', 
        render: (val) => `${val || 0}%`, 
        width: 80 
    },
    { 
        title: 'Subtotal', 
        dataIndex: 'subtotal', 
        key: 'subtotal', 
        align: 'right',
        render: (val) => <Text strong>{formatCurrency(val)}</Text>
    }
];

const TransaksiJualDetailModal = ({ open, onCancel, transaksi }) => {
    const [timelineData, setTimelineData] = useState([]);
    const [fetchedItems, setFetchedItems] = useState([]); 
    const [loadingData, setLoadingData] = useState(false);

    useEffect(() => {
        if (open && transaksi?.id) {
            setLoadingData(true);
            const invoiceId = transaksi.id;
            const itemsRef = query(ref(db, 'invoice_items'), orderByChild('invoiceId'), equalTo(invoiceId));
            const allocRef = query(ref(db, 'payment_allocations'), orderByChild('invoiceId'), equalTo(invoiceId));
            const returnsRef = query(ref(db, 'returns'), orderByChild('invoiceId'), equalTo(invoiceId));

            const unsubscribeItems = onValue(itemsRef, (snapshot) => {
                setFetchedItems(snapshot.exists() ? Object.values(snapshot.val()) : []);
            });

            let allocData = [];
            let returnsData = [];

            const unsubscribeAlloc = onValue(allocRef, (snapshot) => {
                allocData = snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({
                    id: key, type: 'PAYMENT', nominal: snapshot.val()[key].amount,
                    date: snapshot.val()[key].createdAt, refId: snapshot.val()[key].paymentId, ...snapshot.val()[key]
                })) : [];
                mergeAndSetTimeline(allocData, returnsData);
            });

            const unsubscribeRet = onValue(returnsRef, (snapshot) => {
                returnsData = snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({
                    id: key, type: 'RETURN', nominal: snapshot.val()[key].totalRetur || snapshot.val()[key].totalBayar || 0, 
                    date: snapshot.val()[key].createdAt || snapshot.val()[key].tanggal, ...snapshot.val()[key]
                })) : [];
                mergeAndSetTimeline(allocData, returnsData);
            });

            return () => {
                unsubscribeItems();
                unsubscribeAlloc();
                unsubscribeRet();
            };
        }
    }, [open, transaksi]);

    const mergeAndSetTimeline = (allocations, returns) => {
        const combined = [...allocations, ...returns];
        combined.sort((a, b) => (b.date || 0) - (a.date || 0));
        setTimelineData(combined);
        setLoadingData(false);
    };
    
    if (!transaksi) return null;

    // --- Ambil Data Langsung dari Object Transaksi (Database) ---
    const {
        id: nomorInvoice,
        tanggal,
        namaCustomer,
        statusPembayaran,
        totalNetto = 0, 
        totalBayar = 0,
        sisaTagihan: sisaDariDB = 0 // Ambil langsung field sisaTagihan dari DB
    } = transaksi;

    // Logika Sisa: Murni Netto - Bayar (Retur sudah inklusif di Netto dari DB)
    const sisaTagihanFinal = totalNetto - totalBayar;

    const getStatusInfo = (status) => {
        if (status === 'LUNAS') return { color: 'green', icon: <CheckCircleOutlined /> };
        if (status === 'BELUM') return { color: 'red', icon: <ExclamationCircleOutlined /> };
        return { color: 'orange', icon: <SyncOutlined spin /> };
    };

    const { color: statusColor, icon: statusIcon } = getStatusInfo(statusPembayaran);

    return (
        <Modal
            style={{ top: 20 }}
            open={open} onCancel={onCancel} centered 
            footer={[<Button key="close" onClick={onCancel}>Tutup</Button>]}
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginRight: 24 }}>
                    <span>Detail Invoice: {nomorInvoice}</span>
                    <Tag icon={statusIcon} color={statusColor} style={{ fontSize: 14, padding: '4px 10px' }}>
                        {statusPembayaran}
                    </Tag>
                </div>
            }
            width={900}
        >
            <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} style={{ marginBottom: 20 }}>
                <Descriptions.Item label="Customer"><Text strong>{namaCustomer}</Text></Descriptions.Item>
                <Descriptions.Item label="Tanggal Transaksi">{formatDate(tanggal)}</Descriptions.Item>
                <Descriptions.Item label="Keterangan" span={2}>{transaksi.keterangan || '-'}</Descriptions.Item>
            </Descriptions>

            {/* --- RINGKASAN KEUANGAN (Hanya Netto, Sudah Bayar, Sisa) --- */}
            <div style={{ background: '#f5f7fa', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid #d9d9d9' }}>
                <Row gutter={[16, 16]} justify="space-between">
                    <Col xs={24} md={7}>
                        <Statistic title="Total Netto (Final)" value={totalNetto} formatter={formatCurrency} valueStyle={{ fontSize: 18, fontWeight: 'bold', color: '#1890ff' }} />
                        <Text type="secondary" style={{ fontSize: 11 }}>*Sudah termasuk potongan retur</Text>
                    </Col>
                    <Col xs={24} md={7}>
                        <Statistic title="Sudah Dibayar" value={totalBayar} formatter={formatCurrency} valueStyle={{ fontSize: 18, color: '#3f8600' }} />
                    </Col>
                    <Col xs={24} md={7}>
                        <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #ffccc7' }}>
                            <Statistic 
                                title="Sisa Tagihan" 
                                value={sisaTagihanFinal} 
                                formatter={formatCurrency} 
                                valueStyle={{ fontSize: 20, fontWeight: 'bold', color: sisaTagihanFinal > 1 ? '#cf1322' : '#3f8600' }} 
                            />
                        </div>
                    </Col>
                </Row>
            </div>

            <Title level={5}>Daftar Buku</Title>
            <Table
                columns={itemColumns} 
                dataSource={fetchedItems}
                rowKey={(r) => r.id || Math.random()} 
                pagination={false}
                bordered size="small" scroll={{ x: 600 }}
                style={{ marginBottom: 24 }}
                loading={loadingData && fetchedItems.length === 0}
                locale={{ emptyText: 'Tidak ada item buku' }}
            />

            <Title level={5}>Riwayat Pembayaran & Retur</Title>
            <div style={{ maxHeight: 300, overflowY: 'auto', padding: '16px 16px 0 16px', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                {loadingData && timelineData.length === 0 ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> : (
                    timelineData.length > 0 ? (
                        <Timeline>
                            {timelineData.map((item) => {
                                const isRetur = item.type === 'RETURN';
                                return (
                                    <Timeline.Item key={item.id} color={isRetur ? 'red' : 'green'} dot={isRetur ? <ArrowLeftOutlined /> : <ArrowRightOutlined />}>
                                        <Row justify="space-between" align="middle">
                                            <Col>
                                                <Text strong style={{ color: isRetur ? '#cf1322' : '#3f8600', fontSize: 15 }}>
                                                    {isRetur ? '-' : '+'} {formatCurrency(item.nominal)}
                                                </Text>
                                                <div style={{ fontSize: 12, color: '#666' }}>{isRetur ? 'RETUR BARANG' : 'ALOKASI PEMBAYARAN'}</div>
                                                <div style={{ fontSize: 11, color: '#999' }}>Ref: {isRetur ? item.id : item.refId}</div>
                                            </Col>
                                            <Col><Text type="secondary" style={{ fontSize: 12 }}>{formatTimestamp(item.date)}</Text></Col>
                                        </Row>
                                    </Timeline.Item>
                                );
                            })}
                        </Timeline>
                    ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada riwayat" />
                )}
            </div>
        </Modal>
    );
};

export default TransaksiJualDetailModal;