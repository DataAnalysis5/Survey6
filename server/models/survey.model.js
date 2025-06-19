import mongoose from 'mongoose';

const surveySchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true 
    },
    department: { 
        type: String, 
        required: true 
    },
    questions: [{
        text: {
            type: String,
            required: true
        },
        type: { 
            type: String, 
            enum: ['text', 'radio', 'checkbox', 'star'],  
            required: true
        },
        options: [{
            type: String
        }]
    }],
    isAllDepartments: {
        type: Boolean,
        default: false
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    active: { 
        type: Boolean, 
        default: true 
    },
    color: {
        type: String,
        default: "#253074"
    }
});

export default mongoose.model('Survey', surveySchema);