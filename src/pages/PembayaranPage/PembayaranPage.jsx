import React, { useState, useMemo, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, Typography,
    Row, Col, message, Tooltip, Tag
} from 'antd';
import {
    PlusOutlined, EditOutlined,
    PrinterOutlined, SearchOutlined, LoadingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// --- FIREBASE IMPORTS (Realtime Database) ---
import { db } from '../../api/firebase'; // Pastikan path ini benar
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
        return [dayjs().startOf('year'), dayjs().endOf('day')];
    });

    const [searchText, setSearchText] = useState('');
    const [printingId, setPrintingId] = useState(null); // State loading khusus print
    
    // --- DATA FETCHING (HEADER ONLY) ---
    // List ini hanya memuat data 'payments' (Header), belum termasuk detail item
    const { pembayaranList = [], loadingPembayaran = true } = usePembayaranStream(dateRange);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPembayaran, setEditingPembayaran] = useState(null);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [pdfFileName, setPdfFileName] = useState('');

    // --- HOOKS ---
    const debouncedSearchText = useDebounce(searchText, 300);
    const deferredSearch = useDeferredValue(debouncedSearchText);
    const isSearching = searchText !== debouncedSearchText;

    // --- FILTER LOGIC ---
    const filteredData = useMemo(() => {
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

    // --- PRINT HANDLER (FETCH DETAIL DULU) ---
    const handlePrintTransaction = async (record) => {
        setPrintingId(record.id); // Aktifkan loading spinner di tombol
        
        try {
            const allocations = [];

            // 1. Buat referensi ke tabel 'payment_allocations' di Realtime Database
            const allocRef = ref(db, 'payment_allocations');
            
            // 2. Query cari data yang punya 'paymentId' sama dengan ID record ini
            const q = query(allocRef, orderByChild('paymentId'), equalTo(record.id));
            
            // 3. Eksekusi Fetch (Ambil Data)
            const snapshot = await get(q);

            // 4. Parsing hasil data snapshot ke array
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    allocations.push({
                        id: childSnapshot.key,
                        ...childSnapshot.val()
                    });
                });
            }

            // 5. Generate PDF dengan data Header (record) + Detail Item (allocations)
            const pdfData = generateNotaPembayaranPDF(record, allocations);
            
            // 6. Tampilkan Modal Preview
            setPdfPreviewUrl(pdfData);
            setPdfFileName(`Nota_${record.id}.pdf`);
            setIsPreviewModalVisible(true);

        } catch (error) {
            console.error("Gagal generate PDF:", error);
            message.error("Gagal mengambil data detail pembayaran.");
        } finally {
            setPrintingId(null); // Matikan loading spinner
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
        // {
        //     title: "Sumber",
        //     dataIndex: 'sumber',
        //     key: 'sumber',
        //     width: 150,
        //     render: (text) => <Tag color={text === 'INVOICE_PAYMENT' ? 'blue' : 'cyan'}>{text}</Tag>,
        //     sorter: (a, b) => (a.sumber || '').localeCompare(b.sumber || ''),
        // },
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
                            // Loading indicator aktif hanya pada tombol baris yang diklik
                            icon={printingId === r.id ? <LoadingOutlined /> : <PrinterOutlined />}
                            onClick={() => handlePrintTransaction(r)}
                            disabled={printingId !== null} // Disable tombol lain saat sedang loading
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
                            suffix={isSearching ? <LoadingOutlined style={{ color: 'rgba(0,0,0,.25)' }} /> : <SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                            style={{ width: 220 }}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Button  type="primary" icon={<PlusOutlined />} onClick={handleTambah}style={{ background: '#1caa28ff', borderColor: '#1caa28ff' }}>
                            Input Pembayaran
                        </Button>
                    </Col>
                </Row>

                <Table
                    columns={columns}
                    dataSource={filteredData}
                    loading={loadingPembayaran}
                    rowKey="id"
                    size="middle"
                    scroll={{ x: 1200 }}
                    pagination={{
                        defaultPageSize: 10,
                        showTotal: (total) => `Total ${total} Data`,
                        showSizeChanger: true
                    }}
                />
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