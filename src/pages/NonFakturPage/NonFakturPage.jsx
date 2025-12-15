import React, { useState, useMemo, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, Typography,
    Row, Col, message, Tooltip, DatePicker, Tag
} from 'antd';
import {
    PlusOutlined, EditOutlined, EyeOutlined,
    PrinterOutlined, SearchOutlined, LoadingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// UTILS & HOOKS
import { currencyFormatter } from '../../utils/formatters';
// Pastikan Anda sudah membuat hook ini atau sesuaikan dengan hook yang ada
import { useNonFakturStream, globalNonFaktur } from '../../hooks/useFirebaseData'; 
import useDebounce from '../../hooks/useDebounce';
import { generateNotaPembayaranPDF } from '../../utils/notamutasipembayaran'; // Bisa disesuaikan jika layout PDF beda

// COMPONENTS
// Anda perlu membuat form ini (lihat catatan di bawah)
import NonFakturForm from './components/NonFakturForm'; 
import PdfPreviewModal from '../BukuPage/components/PdfPreviewModal';

dayjs.locale('id');
const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- STYLING ---
const styles = {
    pageContainer: { padding: '24px', backgroundColor: '#f0f5ff', minHeight: '100vh' },
    card: { borderRadius: 8, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', background: '#fff' },
    headerTitle: { fontSize: 16, fontWeight: 600, color: '#1d39c4' },
};

const NonFakturPage = () => {
    // --- STATE ---
    // Default 1 tahun atau ambil dari global cache
    const [dateRange, setDateRange] = useState(() => {
        if (typeof globalNonFaktur !== 'undefined' && globalNonFaktur.lastDateRange) {
            return globalNonFaktur.lastDateRange;
        }
        return [dayjs().startOf('year'), dayjs().endOf('day')];
    });

    const [searchText, setSearchText] = useState('');
    const [printingId, setPrintingId] = useState(null);
    
    // --- DATA FETCHING ---
    // Asumsi: useNonFakturStream mengembalikan { nonFakturList, loadingNonFaktur }
    const { nonFakturList = [], loadingNonFaktur = true } = useNonFakturStream(dateRange);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [pdfFileName, setPdfFileName] = useState('');

    // --- HOOKS ---
    const debouncedSearchText = useDebounce(searchText, 300);
    const deferredSearch = useDeferredValue(debouncedSearchText);
    const isSearching = searchText !== debouncedSearchText;

    // --- FILTER LOGIC ---
    const filteredData = useMemo(() => {
        // Safe Copy
        let data = [...(nonFakturList || [])];

        if (deferredSearch) {
            const q = deferredSearch.toLowerCase();
            data = data.filter(tx =>
                (tx.id || '').toLowerCase().includes(q) ||           // Cari ID VF
                (tx.nomorInvoice || '').toLowerCase().includes(q) || // Cari Nomor Invoice VF
                (tx.keterangan || '').toLowerCase().includes(q) ||   // Cari Keterangan (misal: NITIP)
                (tx.namaPelanggan || '').toLowerCase().includes(q)   // Cari Nama Pelanggan
            );
        }

        // Sort by tanggal terbaru (menggunakan field 'tanggal' dari JSON)
        data.sort((a, b) => b.tanggal - a.tanggal);
        return data;
    }, [nonFakturList, deferredSearch]);

    // --- HANDLERS ---
    const handleTambah = () => { 
        setEditingRecord(null); 
        setIsModalOpen(true); 
    };

    const handleEdit = (record) => { 
        setEditingRecord({ ...record }); 
        setIsModalOpen(true); 
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setEditingRecord(null), 300);
    };

    const handlePrintTransaction = async (record) => {
        setPrintingId(record.id);
        setTimeout(() => {
            try {
                // Persiapan data untuk PDF
                // Menyesuaikan struktur JSON NonFaktur agar kompatibel dengan generator PDF yang ada
                const dataToPrint = {
                    ...record,
                    id: record.id, // VF...
                    // Jika NonFaktur tidak punya detail alokasi banyak, kita buat list dummy agar PDF tetap jalan
                    listInvoices: record.detailAlokasi ? Object.values(record.detailAlokasi) : [{
                        noInvoice: record.nomorInvoice || record.id || '-',
                        keterangan: record.keterangan || 'Non-Faktur',
                        jumlahBayar: record.jumlah
                    }]
                };

                const pdfData = generateNotaPembayaranPDF(dataToPrint);
                setPdfPreviewUrl(pdfData);
                setPdfFileName(`Nota_NonFaktur_${record.id}.pdf`);
                setIsPreviewModalVisible(true);
            } catch (error) {
                console.error("Gagal generate PDF:", error);
                message.error("Gagal membuat PDF");
            } finally {
                setPrintingId(null);
            }
        }, 100);
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
            width: 120,
            fixed: 'left',
            render: (t) => dayjs(t).format('DD MMM YYYY'),
            sorter: (a, b) => a.tanggal - b.tanggal,
            defaultSortOrder: 'descend',
        },
        {
            title: "ID Non-Faktur",
            dataIndex: 'id',
            key: 'id',
            width: 150,
            // Menampilkan ID VF...
            render: (text) => <Tag color="purple">{text}</Tag>,
            sorter: (a, b) => (a.id || '').localeCompare(b.id || ''),
        },
        {
            title: "Nama Pelanggan",
            dataIndex: 'namaPelanggan',
            key: 'namaPelanggan',
            width: 200,
            render: (text) => <Text strong>{text || 'Umum'}</Text>,
            sorter: (a, b) => (a.namaPelanggan || '').localeCompare(b.namaPelanggan || ''),
        },
        {
            title: "Keterangan",
            dataIndex: 'keterangan',
            key: 'keterangan',
            width: 200,
            render: (text) => <div style={{ fontSize: 13, color: '#595959' }}>{text || '-'}</div>,
        },
        {
            title: "Nominal",
            dataIndex: 'jumlah', // Menggunakan field 'jumlah' sesuai JSON
            key: 'jumlah',
            align: 'right',
            width: 150,
            render: (val) => <Text strong style={{ color: '#d4380d' }}>{currencyFormatter(val)}</Text>,
            sorter: (a, b) => (a.jumlah || 0) - (b.jumlah || 0),
        },
        {
            title: 'Aksi',
            key: 'aksi',
            align: 'center',
            width: 100,
            fixed: 'right',
            render: (_, r) => (
                <Space>
                    <Tooltip title="Cetak Nota">
                        <Button
                            type="text"
                            icon={printingId === r.id ? <LoadingOutlined /> : <PrinterOutlined />}
                            onClick={() => handlePrintTransaction(r)}
                            disabled={printingId !== null && printingId !== r.id}
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
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
                        <Text style={styles.headerTitle}>Riwayat Non-Faktur (VF)</Text>
                    </Col>
                    <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <RangePicker
                            style={{ width: 260 }}
                            onChange={(d) => d && setDateRange(d)}
                            value={dateRange}
                            format="DD MMM YYYY"
                            allowClear={false}
                        />
                        <Input
                            placeholder="Cari VF, Pelanggan..."
                            suffix={isSearching ? <LoadingOutlined style={{ color: 'rgba(0,0,0,.25)' }} /> : <SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                            style={{ width: 200 }}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleTambah} style={{ background: '#722ed1', borderColor: '#722ed1' }}>
                            Input Non-Faktur
                        </Button>
                    </Col>
                </Row>

                <Table
                    columns={columns}
                    dataSource={filteredData}
                    loading={loadingNonFaktur}
                    rowKey="id"
                    size="middle"
                    scroll={{ x: 1000 }}
                    pagination={{
                        defaultPageSize: 10,
                        showTotal: (total) => `Total ${total} Data`,
                        showSizeChanger: true
                    }}
                />
            </Card>

            {/* FORM MODAL (Perlu dibuat terpisah) */}
            {isModalOpen && (
                <NonFakturForm
                    key={editingRecord ? editingRecord.id : 'create-new-vf'}
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    initialValues={editingRecord}
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

export default NonFakturPage;