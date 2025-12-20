import React, { useState, useMemo, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, Typography,
    Row, Col, message, Tooltip, Tag, Spin
} from 'antd';
import {
    PlusOutlined, EditOutlined,
    PrinterOutlined, SearchOutlined, LoadingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// --- FIREBASE IMPORTS (Realtime Database) ---
import { db } from '../../api/firebase'; 
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';

// UTILS & HOOKS
import { currencyFormatter } from '../../utils/formatters';
import { usePembayaranStream, globalPembayaran } from '../../hooks/useFirebaseData';
import useDebounce from '../../hooks/useDebounce';
import { generateNotaPembayaranPDF } from '../../utils/notamutasipembayaran';

// COMPONENTS
import PembayaranForm from './components/PembayaranForm';
import PdfPreviewModal from '../BukuPage/components/PdfPreviewModal';
import { DatePicker } from 'antd';

dayjs.locale('id');
const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- STYLING ---
const styles = {
    pageContainer: { padding: '24px', backgroundColor: '#00ff1514', minHeight: '100vh' },
    card: { borderRadius: 8, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', background: '#fff' },
    headerTitle: { fontSize: 16, fontWeight: 600, color: '#1caa28ff' },
};

const PembayaranPage = () => {
    // --- STATE ---
    const [dateRange, setDateRange] = useState(() => {
        if (globalPembayaran.lastDateRange) {
            return globalPembayaran.lastDateRange;
        }
return [
    dayjs().subtract(6, 'month').startOf('day'),
    dayjs().endOf('day'),
];
    });

    const [searchText, setSearchText] = useState('');
    const [printingId, setPrintingId] = useState(null); // State loading khusus print
    
    // --- DATA FETCHING (HEADER ONLY) ---
    const { pembayaranList = [], loadingPembayaran = true } = usePembayaranStream(dateRange);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPembayaran, setEditingPembayaran] = useState(null);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [pdfFileName, setPdfFileName] = useState('');

    // --- [OPTIMASI 1] HOOKS & DEBOUNCE ---
    // Ubah debounce ke 800ms agar lebih santai saat mengetik
    const debouncedSearchText = useDebounce(searchText, 800);
    
    // [OPTIMASI 2] Deferred Value
    // React akan memproses ini di background (prioritas rendah)
    const deferredSearch = useDeferredValue(debouncedSearchText);
    
    // [OPTIMASI 3] Deteksi Background Processing
    // Jika input user (debounced) beda dengan hasil proses (deferred), berarti sedang loading
    const isProcessing = debouncedSearchText !== deferredSearch;

    // Gabungkan status loading
    const isLoading = loadingPembayaran || isProcessing;

    // --- FILTER LOGIC ---
    const filteredData = useMemo(() => {
        // Gunakan deferredSearch di sini agar UI tidak freeze
        let data = [...(pembayaranList || [])];

        if (deferredSearch) {
            const q = deferredSearch.toLowerCase();
            data = data.filter(tx =>
                (tx.id || '').toLowerCase().includes(q) ||
                (tx.namaCustomer || '').toLowerCase().includes(q) ||
                (tx.keterangan || '').toLowerCase().includes(q) ||
                (tx.sumber || '').toLowerCase().includes(q)
            );
        }

        // Sort: Tanggal Terbaru
        data.sort((a, b) => b.tanggal - a.tanggal);
        return data;
    }, [pembayaranList, deferredSearch]);

    // --- HANDLERS ---
    const handleTambah = () => { setEditingPembayaran(null); setIsModalOpen(true); };
    const handleEdit = (record) => { setEditingPembayaran({ ...record }); setIsModalOpen(true); };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setEditingPembayaran(null), 300);
    };

    // --- PRINT HANDLER ---
    const handlePrintTransaction = async (record) => {
        setPrintingId(record.id); 
        
        try {
            const allocations = [];
            const allocRef = ref(db, 'payment_allocations');
            const q = query(allocRef, orderByChild('paymentId'), equalTo(record.id));
            const snapshot = await get(q);

            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    allocations.push({
                        id: childSnapshot.key,
                        ...childSnapshot.val()
                    });
                });
            }

            const pdfData = generateNotaPembayaranPDF(record, allocations);
            setPdfPreviewUrl(pdfData);
            setPdfFileName(`Nota_${record.id}.pdf`);
            setIsPreviewModalVisible(true);

        } catch (error) {
            console.error("Gagal generate PDF:", error);
            message.error("Gagal mengambil data detail pembayaran.");
        } finally {
            setPrintingId(null);
        }
    };

    const handleClosePreviewModal = () => {
        setIsPreviewModalVisible(false);
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl('');
    };

    // --- TABLE COLUMNS ---
    const columns = [
        {
            title: "Tanggal",
            dataIndex: 'tanggal',
            key: 'tanggal',
            width: 130,
            fixed: 'left',
            render: (val) => dayjs(val).format('DD MMM YYYY'),
            sorter: (a, b) => a.tanggal - b.tanggal,
            defaultSortOrder: 'descend',
        },
        {
            title: "ID Pembayaran",
            dataIndex: 'id',
            key: 'id',
            width: 150,
            render: (text) => <Text copyable style={{ fontSize: 12 }}>{text}</Text>,
            sorter: (a, b) => (a.id || '').localeCompare(b.id || ''),
        },
        {
            title: "Nama Customer",
            dataIndex: 'namaCustomer',
            key: 'namaCustomer',
            width: 250,
            render: (text) => (
                <div style={{ lineHeight: '1.2' }}>
                    <Text strong>{text || 'Umum'}</Text>
                </div>
            ),
            sorter: (a, b) => (a.namaCustomer || '').localeCompare(b.namaCustomer || ''),
        },
        {
            title: "Keterangan",
            dataIndex: 'keterangan',
            key: 'keterangan',
            render: (text) => <Text type="secondary" style={{ fontSize: 13 }}>{text || '-'}</Text>,
            sorter: (a, b) => (a.keterangan || '').localeCompare(b.keterangan || ''),
        },
        {
            title: "Total Bayar",
            dataIndex: 'totalBayar',
            key: 'totalBayar',
            align: 'right',
            width: 160,
            render: (val) => <Text strong style={{ color: '#3f8600' }}>{currencyFormatter(val)}</Text>,
            sorter: (a, b) => (a.totalBayar || 0) - (b.totalBayar || 0),
        },
        {
            title: 'Aksi',
            key: 'aksi',
            align: 'center',
            width: 100,
            fixed: 'right',
            render: (_, r) => (
                <Space size="small">
                    <Tooltip title="Cetak">
                        <Button
                            size="small"
                            type="text"
                            icon={printingId === r.id ? <LoadingOutlined /> : <PrinterOutlined />}
                            onClick={() => handlePrintTransaction(r)}
                            disabled={printingId !== null} 
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
                    </Tooltip>
                </Space>
            )
        },
    ];

    return (
        <Content style={styles.pageContainer}>
            <Card style={styles.card}>
                <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 20 }}>
                    <Col xs={24} md={8}>
                        <Text style={styles.headerTitle}>Daftar Pembayaran</Text>
                    </Col>
                    <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <RangePicker
                            style={{ width: 240 }}
                            onChange={(d) => d && setDateRange(d)}
                            value={dateRange}
                            format="DD MMM YYYY"
                            allowClear={false}
                        />
                        <Input
                            placeholder="Cari Customer, ID, Ket..."
                            // Indikator visual search aktif (saat debounce)
                            suffix={searchText !== debouncedSearchText ? <LoadingOutlined style={{ color: 'rgba(0,0,0,.25)' }} /> : <SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                            style={{ width: 220 }}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleTambah} style={{ background: '#1caa28ff', borderColor: '#1caa28ff' }}>
                            Input Pembayaran
                        </Button>
                    </Col>
                </Row>

                {/* [OPTIMASI 4] Bungkus Table dengan Spin & isLoading gabungan */}
                <Spin spinning={isLoading} tip="Memproses data..." size="large" style={{ minHeight: 200 }}>
                    <Table
                        columns={columns}
                        dataSource={filteredData}
                        // Loading bawaan tabel dimatikan, diganti Spin di luar agar lebih jelas
                        loading={false} 
                        rowKey="id"
                        size="middle"
                        scroll={{ x: 1200 }}
                        pagination={{
                            defaultPageSize: 10,
                            showTotal: (total) => `Total ${total} Data`,
                            showSizeChanger: true
                        }}
                    />
                </Spin>
            </Card>

            {isModalOpen && (
                <PembayaranForm
                    key={editingPembayaran ? editingPembayaran.id : 'create-new'}
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    initialValues={editingPembayaran}
                />
            )}

            <PdfPreviewModal
                visible={isPreviewModalVisible}
                onClose={handleClosePreviewModal}
                pdfBlobUrl={pdfPreviewUrl}
                fileName={pdfFileName}
            />
        </Content>
    );
};

export default PembayaranPage;