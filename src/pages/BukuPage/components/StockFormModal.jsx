import React, { useState, useEffect, useMemo } from 'react';
import { 
    Modal, Form, Input, InputNumber, Row, Col, Grid, message, Spin, 
    Alert, Typography, Table, Button, DatePicker, Space, Empty 
} from 'antd';
import { 
    ref, push, serverTimestamp, runTransaction, query, orderByChild, onValue, set, equalTo 
} from 'firebase/database';
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { db } from '../../../api/firebase';
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const StokFormModal = ({ open, onCancel, buku }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    
    // State Data
    const [fullHistory, setFullHistory] = useState([]); 
    const [historyLoading, setHistoryLoading] = useState(false);
    const screens = Grid.useBreakpoint();

    // --- STATE FILTER & PDF ---
    const [dateRange, setDateRange] = useState(null);
    const [searchText, setSearchText] = useState(''); // State untuk Search
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);

    // --- 1. INISIALISASI ---
    useEffect(() => {
        if (!open) {
            // Reset saat modal ditutup
            form.resetFields();
            setDateRange(null); 
            setSearchText(''); // Reset search
            setPdfPreviewUrl(null);
            setFullHistory([]);
        }
    }, [open, form]);

    // --- 2. FETCH DATA (STREAMING) ---
    useEffect(() => {
        if (open && buku?.id) {
            setHistoryLoading(true);
            
            const bookHistoryRef = query(
                ref(db, 'historiStok'),
                orderByChild('id'),
                equalTo(buku.id)
            );

            const unsubscribe = onValue(bookHistoryRef, (snapshot) => {
                const data = snapshot.val();
                const loadedHistory = data
                    ? Object.keys(data).map((key) => ({ id: key, ...data[key] }))
                    : [];
                
                // Sortir: Terbaru di atas
                loadedHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                
                setFullHistory(loadedHistory);
                setHistoryLoading(false);
            }, (error) => {
                console.error("Firebase Read Error:", error);
                message.error("Gagal memuat riwayat.");
                setHistoryLoading(false);
            });

            return () => unsubscribe();
        }
    }, [open, buku?.id]);

    // --- 3. FILTERING LOGIC (Date + Search) ---
    const filteredHistory = useMemo(() => {
        let data = fullHistory;

        // 1. Filter Date Range
        if (dateRange) {
            const [start, end] = dateRange;
            const startTime = start.startOf('day').valueOf();
            const endTime = end.endOf('day').valueOf();

            data = data.filter((item) => {
                const itemTime = item.timestamp;
                return itemTime >= startTime && itemTime <= endTime;
            });
        }

        // 2. Filter Search Text (Keterangan atau Angka)
        if (searchText) {
            const lowerSearch = searchText.toLowerCase();
            data = data.filter((item) => {
                const ket = (item.keterangan || '').toLowerCase();
                // Konversi angka ke string untuk pencarian
                const masuk = item.perubahan > 0 ? String(item.perubahan) : '';
                const keluar = item.perubahan < 0 ? String(Math.abs(item.perubahan)) : '';
                const sisa = String(item.stokSesudah || '');

                return ket.includes(lowerSearch) || 
                       masuk.includes(lowerSearch) || 
                       keluar.includes(lowerSearch) || 
                       sisa.includes(lowerSearch);
            });
        }

        return data;
    }, [fullHistory, dateRange, searchText]);

    // --- 4. LOGIC GENERATE PDF ---
    const handleGeneratePdf = () => {
        if (filteredHistory.length === 0) {
            message.warning("Tidak ada data untuk dicetak.");
            return;
        }

        setIsPdfGenerating(true);
        setIsPdfModalOpen(true);

        setTimeout(() => {
            try {
                const doc = new jsPDF();
                
                // --- Header PDF ---
                doc.setFontSize(16);
                doc.text(`Laporan Kartu Stok`, 14, 20);
                
                doc.setFontSize(11);
                doc.setFont("helvetica", "bold");
                doc.text(`${buku.judul}`, 14, 28);
                doc.setFont("helvetica", "normal");

                doc.setFontSize(10);
                doc.text(`Kode: ${buku.kode_buku || '-'}  |  Penerbit: ${buku.penerbit || '-'}`, 14, 34);
                doc.text(`Stok Saat Ini: ${numberFormatter(buku.stok)}`, 14, 40);
                
                let periodeText = "Semua Riwayat";
                if (dateRange) {
                    periodeText = `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`;
                }
                if (searchText) {
                    periodeText += ` (Filter: "${searchText}")`;
                }
                doc.text(`Periode: ${periodeText}`, 14, 46);

                // --- Tabel PDF ---
                const tableHead = [['No', 'Tanggal', 'Masuk', 'Keluar', 'Sisa', 'Keterangan']];
                
                const tableBody = filteredHistory.map((item, index) => {
                    const num = Number(item.perubahan || 0);
                    const masuk = num > 0 ? formatNumberPdf(num) : '-';
                    const keluar = num < 0 ? formatNumberPdf(Math.abs(num)) : '-';
                    
                    return [
                        index + 1,
                        dayjs(item.timestamp).format('DD/MM/YY HH:mm'),
                        masuk,
                        keluar,
                        formatNumberPdf(item.stokSesudah),
                        item.keterangan || '-' 
                    ];
                });

                autoTable(doc, {
                    startY: 52,
                    head: tableHead,
                    body: tableBody,
                    theme: 'grid',
                    styles: { fontSize: 9, cellPadding: 2, valign: 'middle' },
                    headStyles: { fillColor: [41, 128, 185], halign: 'center', textColor: 255 },
                    columnStyles: {
                        0: { halign: 'center', cellWidth: 10 },
                        1: { cellWidth: 35 },
                        2: { halign: 'right', textColor: [0, 150, 0], cellWidth: 25 },
                        3: { halign: 'right', textColor: [200, 0, 0], cellWidth: 25 },
                        4: { halign: 'right', fontStyle: 'bold', cellWidth: 25 },
                        5: { cellWidth: 'auto' }
                    }
                });

                const blob = doc.output('blob');
                setPdfPreviewUrl(URL.createObjectURL(blob));
            } catch (error) {
                console.error("PDF Error:", error);
                message.error("Gagal membuat PDF.");
            } finally {
                setIsPdfGenerating(false);
            }
        }, 100);
    };

    const formatNumberPdf = (val) => new Intl.NumberFormat('id-ID').format(val || 0);

    // --- 5. UPDATE STOK ---
    const handleStokUpdate = async (values) => {
        const { jumlah, keterangan } = values;
        const jumlahNum = Number(jumlah);

        if (isNaN(jumlahNum) || jumlahNum === 0) {
            message.error('Jumlah tidak boleh 0.');
            return;
        }

        setLoading(true);
        try {
            const bukuRef = ref(db, `buku/${buku.id}`);
            let stokSebelum = 0, stokSesudah = 0;

            await runTransaction(bukuRef, (current) => {
                if (!current) return;
                stokSebelum = Number(current.stok) || 0;
                stokSesudah = stokSebelum + jumlahNum;
                return { ...current, stok: stokSesudah, updatedAt: serverTimestamp() };
            });

            const newHistoryRef = push(ref(db, 'historiStok'));
            await set(newHistoryRef, {
                bukuId: buku.id,
                judul: buku.judul || 'N/A',
                kode_buku: buku.kode_buku || 'N/A',
                penerbit: buku.penerbit || 'N/A',
                perubahan: jumlahNum,
                stokSebelum,
                stokSesudah,
                keterangan: keterangan || (jumlahNum > 0 ? 'Stok Masuk' : 'Stok Keluar'),
                timestamp: serverTimestamp(),
            });

            message.success('Stok berhasil diperbarui.');
            form.resetFields(); 
        } catch (error) {
            message.error('Gagal update stok: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- KOLOM TABEL UI ---
    const modalHistoryColumns = [
        { title: 'Waktu', dataIndex: 'timestamp', width: 140, render: timestampFormatter },
        { 
            title: 'Masuk', dataIndex: 'perubahan', width: 80, align: 'right',
            render: (val) => Number(val) > 0 ? <Text type="success">{numberFormatter(val)}</Text> : <Text type="secondary">-</Text> 
        },
        { 
            title: 'Keluar', dataIndex: 'perubahan', width: 80, align: 'right',
            render: (val) => Number(val) < 0 ? <Text type="danger">{numberFormatter(Math.abs(val))}</Text> : <Text type="secondary">-</Text> 
        },
        { title: 'Sisa', dataIndex: 'stokSesudah', width: 80, align: 'right', render: (val) => <Text strong>{numberFormatter(val)}</Text> },
        { 
            title: 'Keterangan', 
            dataIndex: 'keterangan', 
            ellipsis: true,
            render: (text) => {
                // Highlight text jika sedang mencari
                if (!searchText) return text;
                const parts = text.split(new RegExp(`(${searchText})`, 'gi'));
                return (
                    <span>
                        {parts.map((part, i) => 
                            part.toLowerCase() === searchText.toLowerCase() 
                                ? <span key={i} style={{ backgroundColor: '#ffc069' }}>{part}</span> 
                                : part
                        )}
                    </span>
                );
            }
        },
    ];

    if (!buku) return null;

    return (
        <>
            <Modal
                title={`Kartu Stok: ${buku.judul}`}
                open={open}
                onCancel={onCancel}
                footer={null}
                destroyOnClose
                width={1300}
                style={{ top: 20 }}
            >
                <Spin spinning={loading}>
                    <Row gutter={24}>
                        {/* KIRI: FORM UPDATE */}
                        <Col lg={7} xs={24} style={{ borderRight: screens.lg ? '1px solid #f0f0f0' : 'none', marginBottom: 24 }}>
                            <Title level={5}>Update Stok Manual</Title>
                            <Alert message={`Stok Saat Ini: ${numberFormatter(buku.stok)}`} type="info" showIcon style={{ marginBottom: 16 }} />
                            
                            <Form form={form} layout="vertical" onFinish={handleStokUpdate} initialValues={{ jumlah: null, keterangan: '' }}>
                                <Form.Item name="jumlah" label="Jumlah (+ Masuk / - Keluar)" rules={[{ required: true, message: 'Wajib diisi' }]}>
                                    <InputNumber style={{ width: '100%' }} placeholder="Contoh: 50 atau -10" size="large" />
                                </Form.Item>
                                <Form.Item name="keterangan" label="Keterangan">
                                    <Input.TextArea rows={2} placeholder="Contoh: Barang Rusak / Restock" />
                                </Form.Item>
                                <Button type="primary" htmlType="submit" block loading={loading} size="large">
                                    Simpan Perubahan
                                </Button>
                            </Form>
                        </Col>

                        {/* KANAN: TABEL RIWAYAT + FILTER */}
                        <Col lg={17} xs={24}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                                <Title level={5} style={{ margin: 0 }}>Riwayat Mutasi Stok</Title>
                                <Space wrap>
                                    {/* SEARCH INPUT */}
                                    <Input 
                                        prefix={<SearchOutlined />} 
                                        placeholder="Cari ket / angka..." 
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        allowClear
                                        style={{ width: 180 }}
                                    />
                                    
                                    {/* DATE FILTER */}
                                    <RangePicker 
                                        value={dateRange} 
                                        onChange={setDateRange} 
                                        format="DD/MM/YYYY"
                                        placeholder={['Mulai', 'Selesai']}
                                        style={{ width: 220 }}
                                        allowClear={true} 
                                    />
                                    
                                    {/* PRINT BUTTON */}
                                    <Button 
                                        icon={<PrinterOutlined />} 
                                        onClick={handleGeneratePdf}
                                        loading={isPdfGenerating}
                                        disabled={historyLoading || filteredHistory.length === 0}
                                    >
                                        Print PDF
                                    </Button>
                                </Space>
                            </div>

                            <Table
                                columns={modalHistoryColumns}
                                dataSource={filteredHistory}
                                loading={historyLoading}
                                rowKey="id"
                                pagination={{ pageSize: 8, size: 'small', showTotal: (total) => `Total ${total} riwayat` }}
                                size="small"
                                scroll={{ x: 'max-content' }}
                                bordered
                            />
                        </Col>
                    </Row>
                </Spin>
            </Modal>

            {/* MODAL PREVIEW PDF */}
            <Modal
                title="Preview Laporan Stok"
                open={isPdfModalOpen}
                onCancel={() => { setIsPdfModalOpen(false); setPdfPreviewUrl(null); }}
                width="80vw"
                style={{ top: 20 }}
                footer={[
                    <Button key="close" onClick={() => setIsPdfModalOpen(false)}>Tutup</Button>
                ]}
                bodyStyle={{ padding: 0, height: '80vh' }}
            >
                {isPdfGenerating ? (
                    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>Membuat PDF...</div>
                    </div>
                ) : pdfPreviewUrl ? (
                    <iframe src={pdfPreviewUrl} width="100%" height="100%" style={{ border: 'none' }} title="PDF Preview" />
                ) : (
                    <Empty description="Gagal memuat preview PDF" style={{ marginTop: 100 }} />
                )}
            </Modal>
        </>
    );
};

export default StokFormModal;